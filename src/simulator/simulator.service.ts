import { Injectable } from '@nestjs/common';
import Complex from 'complex.js';
import { zeros, eye } from '../utils/complex';

const I = eye(2);
const X: Complex[][] = [[new Complex(0, 0), new Complex(1, 0)], [new Complex(1, 0), new Complex(0, 0)]];
const Y: Complex[][] = [[new Complex(0, 0), new Complex(0, -1)], [new Complex(0, 1), new Complex(0, 0)]];
const Z: Complex[][] = [[new Complex(1, 0), new Complex(0, 0)], [new Complex(0, 0), new Complex(-1, 0)]];
const H: Complex[][] = [
  [new Complex(1 / Math.sqrt(2), 0), new Complex(1 / Math.sqrt(2), 0)],
  [new Complex(1 / Math.sqrt(2), 0), new Complex(-1 / Math.sqrt(2), 0)]
];

const RX = (theta: number): Complex[][] => [
  [new Complex(Math.cos(theta/2), 0), new Complex(0, -Math.sin(theta/2))],
  [new Complex(0, -Math.sin(theta/2)), new Complex(Math.cos(theta/2), 0)]
];

const RY = (theta: number): Complex[][] => [
  [new Complex(Math.cos(theta/2), 0), new Complex(-Math.sin(theta/2), 0)],
  [new Complex(Math.sin(theta/2), 0), new Complex(Math.cos(theta/2), 0)]
];

const RZ = (theta: number): Complex[][] => [
  [new Complex(Math.cos(theta/2), -Math.sin(theta/2)), new Complex(0, 0)],
  [new Complex(0, 0), new Complex(Math.cos(theta/2), Math.sin(theta/2))]
];

const CNOT: Complex[][] = [
  [new Complex(1,0), new Complex(0,0), new Complex(0,0), new Complex(0,0)],
  [new Complex(0,0), new Complex(1,0), new Complex(0,0), new Complex(0,0)],
  [new Complex(0,0), new Complex(0,0), new Complex(0,0), new Complex(1,0)],
  [new Complex(0,0), new Complex(0,0), new Complex(1,0), new Complex(0,0)]
];

@Injectable()
export class SimulatorService {
  createInitialState(n: number): Complex[] {
    const dim = 1 << n;
    const state = new Array(dim).fill(new Complex(0, 0));
    state[0] = new Complex(1, 0);
    return state;
  }

  applyGate(state: Complex[], gateMatrix: Complex[][], qubits: number[], totalQubits: number): Complex[] {
    const n = totalQubits;
    const k = qubits.length;
    const dimState = 1 << n;
    const dimGate = 1 << k;
    const newState = new Array(dimState).fill(new Complex(0, 0));

    const intToBits = (val: number, bits: number): number[] => {
      const b = new Array(bits).fill(0);
      for (let i = 0; i < bits; i++) {
        b[bits - 1 - i] = (val >> i) & 1;
      }
      return b;
    };
    const bitsToInt = (bits: number[]): number => {
      let res = 0;
      for (let i = 0; i < bits.length; i++) {
        res = (res << 1) | bits[i];
      }
      return res;
    };

    for (let i = 0; i < dimState; i++) {
      const bits = intToBits(i, n);
      const subBits = qubits.map(q => bits[q]);
      const subIdx = bitsToInt(subBits);
      for (let j = 0; j < dimGate; j++) {
        const amp = gateMatrix[j][subIdx];
        if (amp.re === 0 && amp.im === 0) continue; 
        const newBits = [...bits];
        const newSubBits = intToBits(j, k);
        for (let idx = 0; idx < k; idx++) {
          newBits[qubits[idx]] = newSubBits[idx];
        }
        const newIdx = bitsToInt(newBits);
        newState[newIdx] = newState[newIdx].add(amp.mul(state[i]));
      }
    }
    return newState;
  }

  getGateMatrix(gate: string, params?: number[]): Complex[][] {
    switch (gate) {
      case 'I': return I;
      case 'X': return X;
      case 'Y': return Y;
      case 'Z': return Z;
      case 'H': return H;
      case 'RX': return RX(params?.[0] ?? 0);
      case 'RY': return RY(params?.[0] ?? 0);
      case 'RZ': return RZ(params?.[0] ?? 0);
      case 'CNOT': return CNOT;
      default: throw new Error(`Unknown gate: ${gate}`);
    }
  }

  private reducedDensityMatrix(state: Complex[], qubit: number, totalQubits: number): Complex[][] {
    const n = totalQubits;
    const dim = 1 << n;
    const rho = zeros(dim, dim);
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        rho[i][j] = state[i].mul(state[j].conjugate());
      }
    }

    const rhoReduced = zeros(2, 2);
    const otherIndices = Array.from({ length: n }, (_, i) => i).filter(i => i !== qubit);
    const otherDim = 1 << (n - 1);

    const bitsToInt = (bits: number[]): number => {
      let res = 0;
      for (let i = 0; i < bits.length; i++) res = (res << 1) | bits[i];
      return res;
    };
    const intToBits = (val: number, bits: number): number[] => {
      const b = new Array(bits).fill(0);
      for (let i = 0; i < bits; i++) b[bits - 1 - i] = (val >> i) & 1;
      return b;
    };

    for (let other = 0; other < otherDim; other++) {
      const otherBits = intToBits(other, n - 1);
      const bits0 = new Array(n).fill(0);
      const bits1 = new Array(n).fill(0);
      bits0[qubit] = 0;
      bits1[qubit] = 1;
      let otherIdx = 0;
      for (let i = 0; i < n; i++) {
        if (i === qubit) continue;
        bits0[i] = otherBits[otherIdx];
        bits1[i] = otherBits[otherIdx];
        otherIdx++;
      }
      const idx0 = bitsToInt(bits0);
      const idx1 = bitsToInt(bits1);
      rhoReduced[0][0] = rhoReduced[0][0].add(rho[idx0][idx0]);
      rhoReduced[0][1] = rhoReduced[0][1].add(rho[idx0][idx1]);
      rhoReduced[1][0] = rhoReduced[1][0].add(rho[idx1][idx0]);
      rhoReduced[1][1] = rhoReduced[1][1].add(rho[idx1][idx1]);
    }
    return rhoReduced;
  }

  simulate(
    gates: { gate: string; qubits: number[]; params?: number[] }[],
    qubitsCount: number,
    shots?: number
  ) {
    let state = this.createInitialState(qubitsCount);
    for (const g of gates) {
      const gateMat = this.getGateMatrix(g.gate, g.params);
      state = this.applyGate(state, gateMat, g.qubits, qubitsCount);
    }

    const probabilities = state.map(amp => amp.abs() ** 2);

    const blochVectors: { x: number; y: number; z: number }[] = [];
    for (let q = 0; q < qubitsCount; q++) {
      const rho = this.reducedDensityMatrix(state, q, qubitsCount);
      const a = rho[0][0];
      const b = rho[0][1];
      const d = rho[1][1];
      const x = 2 * b.re;
      const y = 2 * b.im;
      const z = a.re - d.re;
      blochVectors.push({ x, y, z });
    }

    let measurements: number[][] | undefined;
    if (shots && shots > 0) {
      measurements = [];
      for (let i = 0; i < shots; i++) {
        const r = Math.random();
        let cum = 0;
        let outcome = 0;
        for (let j = 0; j < probabilities.length; j++) {
          cum += probabilities[j];
          if (r < cum) {
            outcome = j;
            break;
          }
        }
        const bits: number[] = [];
        for (let j = 0; j < qubitsCount; j++) {
          bits.unshift((outcome >> j) & 1);
        }
        measurements.push(bits);
      }
    }

    return { probabilities, blochVectors, measurements };
  }
}