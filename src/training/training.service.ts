import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { SimulatorService } from '../simulator/simulator.service';
import { HybridModel } from '../quantum/hybrid-model';
import { loadDataset, loadDatasetUniversal } from '../simulator/dataset-loader';
import { CreateTrainingDto } from './dto/create-training.dto';
import * as path from 'path';

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);
  private runningJobs = new Map<string, { abort: () => void }>();

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private simulator: SimulatorService,
  ) {}

  async create(dto: CreateTrainingDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    let qubitsCount = dto.qubitsCount;
    let gates = dto.gates;
    if (dto.circuitId) {
      const circuit = await this.prisma.circuit.findUnique({
        where: { id: dto.circuitId },
      });
      if (!circuit) throw new NotFoundException('Circuit not found');
      qubitsCount = circuit.qubitsCount;
      gates = circuit.gates as any[];
    } else if (!gates || !qubitsCount) {
      throw new Error('Either circuitId or gates+qubitsCount must be provided');
    }

    const training = await this.prisma.trainingRun.create({
      data: {
        projectId: dto.projectId,
        circuitId: dto.circuitId,
        dataset: dto.dataset,
        epochs: dto.epochs,
        learningRate: dto.learningRate,
        bondDim: dto.bondDim,
        qubitsCount,
        gates: gates as any,
        status: 'pending',
      },
    });

    this.startTraining(training.id).catch((err) => {
      this.logger.error(`Training ${training.id} failed`, err);
    });

    return { id: training.id };
  }

  private async startTraining(id: string) {
    this.logger.log(`[${id}] Training started`);
    const training = await this.prisma.trainingRun.findUnique({
      where: { id },
    });
    if (!training) throw new Error('Training not found');

    await this.prisma.trainingRun.update({
      where: { id },
      data: { status: 'running', startedAt: new Date() },
    });

    let xTrain: number[][],
      yTrain: number[][],
      xVal: number[][],
      yVal: number[][];
    try {
      const filePath = path.join(
        process.cwd(),
        'assets',
        `${training.dataset}.csv`,
      );
      const result = await loadDatasetUniversal(filePath, {
        targetColumn: -1,
        classification: undefined,
        splitRatio: 0.8,
        header: 'auto',
      });
      xTrain = result.xTrain;
      yTrain = result.yTrain;
      xVal = result.xVal;
      yVal = result.yVal;
      this.logger.log(`[${id}] Loaded universal CSV: ${training.dataset}`);
    } catch (err) {
      // fallback на старый loadDataset (Iris, MNIST)
      try {
        const dataset = await loadDataset(training.dataset);
        xTrain = dataset.xTrain;
        yTrain = dataset.yTrain;
        xVal = dataset.xVal;
        yVal = dataset.yVal;
        this.logger.log(`[${id}] Loaded legacy dataset: ${training.dataset}`);
      } catch (err2) {
        await this.prisma.trainingRun.update({
          where: { id },
          data: { status: 'failed', finishedAt: new Date() },
        });
        return;
      }
    }

    let outputDim: number;
    let taskType: 'classification' | 'regression';
    const sampleY = yTrain[0];
    if (sampleY.length > 1) {
      outputDim = sampleY.length;
      taskType = 'classification';
    } else if (sampleY.length === 1) {
      outputDim = 1;
      taskType = 'regression';
    } else {
      throw new Error('Unsupported target format');
    }
    this.logger.log(`[${id}] Task: ${taskType}, output dim: ${outputDim}`);

    let model: HybridModel;
    try {
      model = new HybridModel(this.simulator, {
        qubitsCount: training.qubitsCount!,
        gates: training.gates as any[],
        encoding: 'angle',
        classicalOutputDim: outputDim,
        learningRate: training.learningRate,
        taskType,
      });
      this.logger.log(
        `[${id}] Model created, qubits=${training.qubitsCount}, task=${taskType}`,
      );
    } catch (err: any) {
      this.logger.error(`[${id}] Failed to create model: ${err.message}`);
      await this.prisma.trainingRun.update({
        where: { id },
        data: { status: 'failed', finishedAt: new Date() },
      });
      this.emitEvent(id, 'error', {
        error: `Model creation failed: ${err.message}`,
      });
      return;
    }

    let aborted = false;
    this.runningJobs.set(id, {
      abort: () => {
        aborted = true;
      },
    });

    const onEpoch = async (epoch: number, loss: number, metric: number) => {
      if (isNaN(loss) || !isFinite(loss)) loss = 1.0;
      if (isNaN(metric) || !isFinite(metric)) metric = 0.0;

      this.logger.log(
        `[${id}] Epoch ${epoch}: loss=${loss.toFixed(4)}, metric=${metric.toFixed(4)}`,
      );
      const currentMetrics = (training.metrics as any) || {
        loss: [],
        accuracy: [],
      };
      currentMetrics.loss.push(loss);
      currentMetrics.accuracy.push(metric);
      await this.prisma.trainingRun.update({
        where: { id },
        data: { metrics: currentMetrics },
      });
      this.emitEvent(id, 'progress', { epoch, loss, metric });
    };

    try {
      this.logger.log(`[${id}] Starting training loop...`);
      const { finalAccuracy } = await model.train(
        xTrain,
        yTrain,
        xVal,
        yVal,
        training.epochs,
        32,
        onEpoch,
        () => aborted,
      );

      if (aborted) {
        await this.prisma.trainingRun.update({
          where: { id },
          data: { status: 'cancelled', finishedAt: new Date() },
        });
        this.emitEvent(id, 'cancelled', {});
        this.logger.log(`[${id}] Training cancelled`);
      } else {
        await this.prisma.trainingRun.update({
          where: { id },
          data: { status: 'completed', finishedAt: new Date(), finalAccuracy },
        });
        this.emitEvent(id, 'completed', { finalAccuracy });
        this.logger.log(
          `[${id}] Training completed with metric ${finalAccuracy}`,
        );
      }
    } catch (err: any) {
      this.logger.error(`[${id}] Training error: ${err.message}\n${err.stack}`);
      await this.prisma.trainingRun.update({
        where: { id },
        data: { status: 'failed', finishedAt: new Date() },
      });
      this.emitEvent(id, 'error', { error: err.message });
    } finally {
      this.runningJobs.delete(id);
    }
  }

  async findOne(id: string) {
    const training = await this.prisma.trainingRun.findUnique({
      where: { id },
    });
    if (!training) throw new NotFoundException('Training not found');
    return training;
  }

  async cancel(id: string) {
    const job = this.runningJobs.get(id);
    if (job) {
      job.abort();
      return { success: true };
    }
    const training = await this.prisma.trainingRun.findUnique({
      where: { id },
    });
    if (training && training.status === 'running') {
      await this.prisma.trainingRun.update({
        where: { id },
        data: { status: 'cancelled', finishedAt: new Date() },
      });
      return { success: true };
    }
    throw new NotFoundException('Training not running or not found');
  }

  private emitEvent(runId: string, event: string, data: any) {
    console.log(`[emitEvent] runId=${runId}, event=${event}, data=`, data);
    this.eventEmitter.emit(`training.${runId}`, { event, data });
  }
}
