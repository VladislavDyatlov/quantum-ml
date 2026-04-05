import Complex from 'complex.js';

export type Matrix = Complex[][];

export function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => Array(cols).fill(new Complex(0, 0)));
}

export function eye(n: number): Matrix {
  const I = zeros(n, n);
  for (let i = 0; i < n; i++) {
    I[i][i] = new Complex(1, 0);
  }
  return I;
}

export function transpose(mat: Matrix): Matrix {
  const rows = mat.length;
  const cols = mat[0].length;
  const res = zeros(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      res[j][i] = mat[i][j];
    }
  }
  return res;
}

export function conjugate(mat: Matrix): Matrix {
  return mat.map(row => row.map(c => c.conjugate()));
}

export function dagger(mat: Matrix): Matrix {
  return conjugate(transpose(mat));
}

export function multiply(A: Matrix, B: Matrix): Matrix {
  const aRows = A.length;
  const aCols = A[0].length;
  const bRows = B.length;
  const bCols = B[0].length;
  if (aCols !== bRows) throw new Error('Matrix dimensions mismatch');
  const result = zeros(aRows, bCols);
  for (let i = 0; i < aRows; i++) {
    for (let j = 0; j < bCols; j++) {
      let sum = new Complex(0, 0);
      for (let k = 0; k < aCols; k++) {
        sum = sum.add(A[i][k].mul(B[k][j]));
      }
      result[i][j] = sum;
    }
  }
  return result;
}

export function multiplyMatrixVector(mat: Matrix, vec: Complex[]): Complex[] {
  const rows = mat.length;
  const cols = mat[0].length;
  if (cols !== vec.length) throw new Error('Dimension mismatch');
  const result = new Array(rows).fill(new Complex(0, 0));
  for (let i = 0; i < rows; i++) {
    let sum = new Complex(0, 0);
    for (let j = 0; j < cols; j++) {
      sum = sum.add(mat[i][j].mul(vec[j]));
    }
    result[i] = sum;
  }
  return result;
}

export function tensor(A: Matrix, B: Matrix): Matrix {
  const aRows = A.length, aCols = A[0].length;
  const bRows = B.length, bCols = B[0].length;
  const rows = aRows * bRows;
  const cols = aCols * bCols;
  const result = zeros(rows, cols);
  for (let i = 0; i < aRows; i++) {
    for (let j = 0; j < aCols; j++) {
      const aVal = A[i][j];
      for (let k = 0; k < bRows; k++) {
        for (let l = 0; l < bCols; l++) {
          const bVal = B[k][l];
          result[i * bRows + k][j * bCols + l] = aVal.mul(bVal);
        }
      }
    }
  }
  return result;
}

export function buildGateMatrix(
  gateMat: Matrix,
  qubits: number[],
  totalQubits: number
): Matrix {
  const n = totalQubits;
  const k = qubits.length;
  let fullMat: Matrix = eye(1 << n);
  throw new Error('Not implemented; use applyGate instead.');
}