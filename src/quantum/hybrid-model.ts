import { SimulatorService } from '../simulator/simulator.service';
import { ClassicalLayer } from '../simulator/classical-layer';
import { ParameterShiftDifferentiator, GateDef } from './parameter-shift';

export interface HybridModelConfig {
  qubitsCount: number;
  gates: GateDef[];
  encoding?: 'angle' | 'amplitude' | 'none';
  classicalOutputDim?: number;
  learningRate?: number;
  finalLearningRate?: number;
  weightDecay?: number;
  dropoutRate?: number;
  taskType?: 'classification' | 'regression';
}

export class HybridModel {
  private params: number[];
  private baseGates: GateDef[];
  private classicalLayer: ClassicalLayer;
  private differentiator: ParameterShiftDifferentiator;
  private encoding: string;
  private lr: number;
  private finalLr: number;
  private weightDecay: number;
  private dropoutRate: number;
  private taskType: 'classification' | 'regression';

  private bestValAcc: number = 0;
  private bestParams: number[] = [];
  private bestClassicalState: any = null;
  private epochsNoImprove: number = 0;
  private patience: number = 20;

  constructor(
    private simulator: SimulatorService,
    private config: HybridModelConfig,
  ) {
    this.baseGates = config.gates;
    this.params = this.extractParameters(config.gates);
    this.encoding = config.encoding || 'angle';
    const quantumOutputDim = 1 << config.qubitsCount;
    const outputDim = config.classicalOutputDim || 2;
    this.lr = config.learningRate || 0.01;
    this.finalLr = config.finalLearningRate || 0.0005;
    this.weightDecay = config.weightDecay || 0.001;
    this.dropoutRate = config.dropoutRate || 0.2;
    this.taskType = config.taskType || 'classification';
    this.classicalLayer = new ClassicalLayer(
      quantumOutputDim,
      outputDim,
      this.lr,
      this.weightDecay,
    );
    this.differentiator = new ParameterShiftDifferentiator(simulator);
  }

  private extractParameters(gates: GateDef[]): number[] {
    const params: number[] = [];
    for (const g of gates) {
      if (['RX', 'RY', 'RZ'].includes(g.gate) && g.params && g.params.length) {
        params.push(g.params[0]);
      }
    }
    return params;
  }

  private buildCircuitWithParams(params: number[]): GateDef[] {
    let idx = 0;
    return this.baseGates.map((g) => {
      if (['RX', 'RY', 'RZ'].includes(g.gate) && g.params) {
        return { ...g, params: [params[idx++]] };
      }
      return { ...g };
    });
  }

  private encodeInput(x: number[]): GateDef[] {
    if (this.encoding === 'angle') {
      const gates: GateDef[] = [];
      for (let i = 0; i < this.config.qubitsCount; i++) {
        const val = i < x.length ? x[i] : 0;
        gates.push({ gate: 'RY', qubits: [i], params: [val] });
      }
      return gates;
    }
    return [];
  }

  async forward(x: number[]): Promise<number[]> {
    const encodingGates = this.encodeInput(x);
    const parametricGates = this.buildCircuitWithParams(this.params);
    const fullCircuit = [...encodingGates, ...parametricGates];
    const { probabilities } = this.simulator.simulate(
      fullCircuit,
      this.config.qubitsCount,
    );
    const logits = this.classicalLayer.forwardLogits(probabilities);
    if (this.taskType === 'classification') {
      const maxLogit = Math.max(...logits);
      const exp = logits.map((v) => Math.exp(v - maxLogit));
      const sum = exp.reduce((a, b) => a + b, 0);
      return exp.map((v) => v / sum);
    } else {
      return [logits[0]];
    }
  }

  private async lossForParams(
    x: number[],
    y: number[],
    params: number[],
  ): Promise<number> {
    const encodingGates = this.encodeInput(x);
    const circuit = this.buildCircuitWithParams(params);
    const full = [...encodingGates, ...circuit];
    const { probabilities } = this.simulator.simulate(
      full,
      this.config.qubitsCount,
    );
    const logits = this.classicalLayer.forwardLogits(probabilities);
    let pred: number[];
    if (this.taskType === 'classification') {
      const maxLogit = Math.max(...logits);
      const exp = logits.map((v) => Math.exp(v - maxLogit));
      const sum = exp.reduce((a, b) => a + b, 0);
      pred = exp.map((v) => v / sum);
    } else {
      pred = [logits[0]];
    }
    return this.loss(pred, y);
  }

  private loss(pred: number[], target: number[]): number {
    if (this.taskType === 'classification') {
      let loss = 0;
      for (let i = 0; i < pred.length; i++) {
        const p = Math.min(Math.max(pred[i], 1e-12), 1 - 1e-12);
        loss -= target[i] * Math.log(p);
      }
      if (isNaN(loss) || !isFinite(loss)) return 1.0;
      return loss;
    } else {
      const diff = pred[0] - target[0];
      return diff * diff;
    }
  }

  private clipGradients(grads: number[], maxNorm: number = 1.0): number[] {
    let norm = Math.sqrt(grads.reduce((s, g) => s + g * g, 0));
    if (norm > maxNorm) {
      return grads.map((g) => (g * maxNorm) / norm);
    }
    return grads;
  }

  async train(
    xTrain: number[][],
    yTrain: number[][],
    xVal: number[][],
    yVal: number[][],
    epochs: number,
    batchSize: number,
    onEpoch?: (epoch: number, loss: number, valAcc: number) => Promise<void>,
    shouldStop?: () => boolean,
  ): Promise<{ finalAccuracy: number }> {
    console.log(
      `[HybridModel] train() started: epochs=${epochs}, batchSize=${batchSize}, samples=${xTrain.length}`,
    );
    if (!xTrain.length || !yTrain.length)
      throw new Error('Empty training dataset');
    if (xTrain.length !== yTrain.length)
      throw new Error('Mismatch in dataset sizes');

    const nSamples = xTrain.length;
    const initialLr = this.lr;
    const finalLr = this.finalLr;

    this.bestValAcc = 0;
    this.epochsNoImprove = 0;
    this.bestParams = [...this.params];
    this.bestClassicalState = this.classicalLayer.getState();

    for (let epoch = 0; epoch < epochs; epoch++) {
      if (shouldStop && shouldStop()) break;

      const progress = epoch / epochs;
      const currentLr =
        finalLr +
        ((initialLr - finalLr) * (1 + Math.cos(Math.PI * progress))) / 2;
      this.classicalLayer.setLearningRate(currentLr);
      this.lr = currentLr;

      console.log(
        `[HybridModel] Epoch ${epoch} started, lr=${currentLr.toFixed(6)}`,
      );

      const indices = Array.from({ length: nSamples }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }

      let totalLoss = 0;
      let correctTrain = 0;

      for (let start = 0; start < nSamples; start += batchSize) {
        const end = Math.min(start + batchSize, nSamples);
        const batchIndices = indices.slice(start, end);
        const batchSizeActual = batchIndices.length;

        let gradQuantumAcc = new Array(this.params.length).fill(0);
        let gradClassicalW: number[][] = [];
        let gradClassicalB: number[] = [];

        for (const idx of batchIndices) {
          const x = xTrain[idx];
          const y = yTrain[idx];

          const encoding = this.encodeInput(x);
          const circuit = this.buildCircuitWithParams(this.params);
          const full = [...encoding, ...circuit];
          const { probabilities } = this.simulator.simulate(
            full,
            this.config.qubitsCount,
          );
          if (!probabilities || probabilities.length === 0)
            throw new Error('Simulator returned empty probabilities');

          const logits = this.classicalLayer.forwardLogits(probabilities);
          let pred: number[];
          if (this.taskType === 'classification') {
            const maxLogit = Math.max(...logits);
            const exp = logits.map((v) => Math.exp(v - maxLogit));
            const sum = exp.reduce((a, b) => a + b, 0);
            pred = exp.map((v) => v / sum);
          } else {
            pred = [logits[0]];
          }

          const loss = this.loss(pred, y);
          totalLoss += loss;

          if (this.taskType === 'classification') {
            const predClass = pred.indexOf(Math.max(...pred));
            const trueClass = y.indexOf(1);
            if (predClass === trueClass) correctTrain++;
          } else {
          }

          let dLoss_dOut: number[];
          if (this.taskType === 'classification') {
            dLoss_dOut = pred.map((p, i) => p - y[i]);
          } else {
            const diff = pred[0] - y[0];
            dLoss_dOut = [2 * diff];
          }

          const { dWeights, dBiases } = this.classicalLayer.backward(
            dLoss_dOut,
            probabilities,
          );

          const lossFn = (p: number[]) => this.lossForParams(x, y, p);
          const gradQuantum = await this.differentiator.computeGradients(
            this.baseGates,
            this.config.qubitsCount,
            lossFn,
          );
          for (let q = 0; q < gradQuantum.length; q++)
            gradQuantumAcc[q] += gradQuantum[q];

          if (gradClassicalW.length === 0) {
            gradClassicalW = dWeights.map((row) => row.map(() => 0));
            gradClassicalB = new Array(dBiases.length).fill(0);
          }
          for (let i = 0; i < dWeights.length; i++) {
            for (let j = 0; j < dWeights[i].length; j++) {
              gradClassicalW[i][j] += dWeights[i][j];
            }
          }
          for (let i = 0; i < dBiases.length; i++) {
            gradClassicalB[i] += dBiases[i];
          }
        }

        const batchNorm = batchSizeActual;
        let quantumGrads = gradQuantumAcc.map((g) => g / batchNorm);
        quantumGrads = this.clipGradients(quantumGrads, 1.0);
        for (let q = 0; q < this.params.length; q++) {
          this.params[q] -= this.lr * quantumGrads[q];
        }

        let classicalW = gradClassicalW.map((row) =>
          row.map((v) => v / batchNorm),
        );
        let classicalB = gradClassicalB.map((v) => v / batchNorm);

        const wd = this.weightDecay;
        const weights = this.classicalLayer.getWeights();
        for (let i = 0; i < classicalW.length; i++) {
          for (let j = 0; j < classicalW[i].length; j++) {
            classicalW[i][j] += wd * weights[i][j];
          }
        }

        let flat: number[] = [];
        classicalW.forEach((row) => row.forEach((v) => flat.push(v)));
        classicalB.forEach((v) => flat.push(v));
        const clippedFlat = this.clipGradients(flat, 1.0);
        let idx = 0;
        for (let i = 0; i < classicalW.length; i++) {
          for (let j = 0; j < classicalW[i].length; j++) {
            classicalW[i][j] = clippedFlat[idx++];
          }
        }
        for (let i = 0; i < classicalB.length; i++) {
          classicalB[i] = clippedFlat[idx++];
        }

        this.classicalLayer.update(classicalW, classicalB);
      }

      const avgLoss = totalLoss / nSamples;
      let trainAcc = 0;
      if (this.taskType === 'classification') {
        trainAcc = correctTrain / nSamples;
        console.log(
          `[HybridModel] Epoch ${epoch} avgLoss=${avgLoss.toFixed(4)}, trainAcc=${trainAcc.toFixed(4)}`,
        );
      } else {
        console.log(
          `[HybridModel] Epoch ${epoch} avgLoss=${avgLoss.toFixed(4)} (regression)`,
        );
      }

      let valCorrect = 0;
      let valLossSum = 0;
      for (let i = 0; i < xVal.length; i++) {
        const out = await this.forward(xVal[i]);
        const loss = this.loss(out, yVal[i]);
        valLossSum += loss;
        if (this.taskType === 'classification') {
          const predClass = out.indexOf(Math.max(...out));
          const trueClass = yVal[i].indexOf(1);
          if (predClass === trueClass) valCorrect++;
        }
      }
      const valMetric =
        this.taskType === 'classification'
          ? valCorrect / xVal.length
          : valLossSum / xVal.length;
      if (this.taskType === 'classification') {
        console.log(
          `[HybridModel] Epoch ${epoch} valAcc=${valMetric.toFixed(4)}`,
        );
      } else {
        console.log(
          `[HybridModel] Epoch ${epoch} valMSE=${valMetric.toFixed(6)}`,
        );
      }

      if (this.taskType === 'classification') {
        if (valMetric > this.bestValAcc) {
          this.bestValAcc = valMetric;
          this.epochsNoImprove = 0;
          this.bestParams = [...this.params];
          this.bestClassicalState = this.classicalLayer.getState();
          console.log(`[HybridModel] New best valAcc: ${valMetric.toFixed(4)}`);
        } else {
          this.epochsNoImprove++;
          if (this.epochsNoImprove >= this.patience) {
            console.log(`[HybridModel] Early stopping at epoch ${epoch}`);
            this.params = [...this.bestParams];
            this.classicalLayer.setState(this.bestClassicalState);
            break;
          }
        }
      }

      if (onEpoch) {
        const progressMetric =
          this.taskType === 'classification' ? valMetric : 1 - valMetric;
        await onEpoch(epoch, avgLoss, progressMetric);
      }
    }

    if (this.taskType === 'classification') {
      const finalParams = this.bestParams.length
        ? this.bestParams
        : this.params;
      const savedParams = this.params;
      this.params = finalParams;
      let finalCorrect = 0;
      for (let i = 0; i < xVal.length; i++) {
        const out = await this.forward(xVal[i]);
        const predClass = out.indexOf(Math.max(...out));
        const trueClass = yVal[i].indexOf(1);
        if (predClass === trueClass) finalCorrect++;
      }
      const finalAccuracy = finalCorrect / xVal.length;
      console.log(
        `[HybridModel] Final accuracy (best model): ${finalAccuracy.toFixed(4)}`,
      );
      this.params = savedParams;
      return { finalAccuracy };
    } else {
      let finalMSE = 0;
      for (let i = 0; i < xVal.length; i++) {
        const out = await this.forward(xVal[i]);
        finalMSE += this.loss(out, yVal[i]);
      }
      finalMSE /= xVal.length;
      console.log(`[HybridModel] Final MSE: ${finalMSE.toFixed(6)}`);
      return { finalAccuracy: 1 - finalMSE }; 
    }
  }

  save(): any {
    return {
      config: this.config,
      quantumParams: this.params,
      classical: this.classicalLayer.getState(),
    };
  }

  load(data: any) {
    this.params = data.quantumParams;
    this.classicalLayer.setState(data.classical);
  }
}
