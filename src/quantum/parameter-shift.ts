
import { SimulatorService } from '../simulator/simulator.service';

export interface GateDef {
  gate: string;
  qubits: number[];
  params?: number[];
}

export class ParameterShiftDifferentiator {
  constructor(private simulator: SimulatorService) {}

  /**
   * Вычисляет градиенты для всех параметрических гейтов.
   * @param baseGates - исходная схема (с параметрами-заглушками)
   * @param qubitsCount - общее число кубитов
   * @param lossFunction - функция, принимающая массив новых параметров и возвращающая лосс
   */
  async computeGradients(
    baseGates: GateDef[],
    qubitsCount: number,
    lossFunction: (params: number[]) => Promise<number>
  ): Promise<number[]> {
    const paramValues: number[] = [];
    const paramIndices: number[] = [];
    for (let i = 0; i < baseGates.length; i++) {
      const g = baseGates[i];
      if (['RX', 'RY', 'RZ'].includes(g.gate) && g.params && g.params.length > 0) {
        paramValues.push(g.params[0]);
        paramIndices.push(i);
      }
    }
    const gradients = new Array(paramValues.length).fill(0);
    const shift = Math.PI / 2;

    for (let idx = 0; idx < paramValues.length; idx++) {
      const plus = [...paramValues];
      const minus = [...paramValues];
      plus[idx] += shift;
      minus[idx] -= shift;

      const lossPlus = await lossFunction(plus);
      const lossMinus = await lossFunction(minus);
      gradients[idx] = (lossPlus - lossMinus) / 2; 
    }
    return gradients;
  }
}