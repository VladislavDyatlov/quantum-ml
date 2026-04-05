import { parentPort, workerData } from 'worker_threads';
import { SimulatorService } from '../simulator/simulator.service';
import { HybridModel } from '../quantum/hybrid-model';
import { loadDataset } from '../simulator/dataset-loader';

(async () => {
  try {
    const { config, datasetName, epochs, batchSize, learningRate } = workerData;

    const { xTrain, yTrain, xVal, yVal } = await loadDataset(datasetName);

    const simulator = new SimulatorService();
    const model = new HybridModel(simulator, {
      qubitsCount: config.qubitsCount,
      gates: config.gates,
      encoding: 'angle',
      classicalOutputDim: config.outputDim,
      learningRate,
    });

    let aborted = false;
    parentPort?.on('message', (msg) => {
      if (msg === 'abort') aborted = true;
    });

    const onEpoch = async (epoch: number, loss: number, valAcc: number) => {
      parentPort?.postMessage({ type: 'progress', epoch, loss, valAcc });
      await new Promise(resolve => setImmediate(resolve));
    };

    const { finalAccuracy } = await model.train(
      xTrain, yTrain, xVal, yVal,
      epochs, batchSize,
      onEpoch,
      () => aborted
    );

    parentPort?.postMessage({ type: 'completed', finalAccuracy });
  } catch (error: any) {
    console.error('Worker error:', error);
    parentPort?.postMessage({ type: 'error', error: error.message || String(error) });
  }
})();