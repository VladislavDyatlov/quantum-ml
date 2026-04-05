export class ClassicalLayer {
  private weights: number[][];
  private biases: number[];
  private mW: number[][];
  private vW: number[][];
  private mb: number[];
  private vb: number[];
  private t: number = 0;
  private weightDecay: number;

  constructor(
    inputDim: number,
    outputDim: number,
    private lr: number = 0.001,
    weightDecay: number = 0.001,
    private beta1: number = 0.9,
    private beta2: number = 0.999,
    private eps: number = 1e-8,
  ) {
    this.weights = Array(outputDim)
      .fill(0)
      .map(() =>
        Array(inputDim)
          .fill(0)
          .map(() => (Math.random() - 0.5) * Math.sqrt(2 / inputDim)),
      );
    this.biases = Array(outputDim)
      .fill(0)
      .map(() => (Math.random() - 0.5) * 0.1);
    this.mW = this.weights.map((row) => row.map(() => 0));
    this.vW = this.weights.map((row) => row.map(() => 0));
    this.mb = this.biases.map(() => 0);
    this.vb = this.biases.map(() => 0);
    this.weightDecay = weightDecay;
  }

  setLearningRate(lr: number) {
    this.lr = lr;
  }

  getWeights() {
    return this.weights;
  }

  forwardLogits(input: number[]): number[] {
    return this.weights.map((row, i) => {
      let sum = 0;
      for (let j = 0; j < row.length; j++) sum += row[j] * input[j];
      return sum + this.biases[i];
    });
  }

  forward(input: number[]): number[] {
    const logits = this.forwardLogits(input);
    const maxLogit = Math.max(...logits);
    const exp = logits.map((v) => Math.exp(v - maxLogit));
    const sumExp = exp.reduce((a, b) => a + b, 0);
    return exp.map((v) => v / sumExp);
  }

  backward(
    dLoss_dOut: number[],
    input: number[],
  ): { dInput: number[]; dWeights: number[][]; dBiases: number[] } {
    const dInput = Array(input.length).fill(0);
    const dWeights = this.weights.map(() => Array(input.length).fill(0));
    const dBiases = this.biases.map(() => 0);

    for (let i = 0; i < this.weights.length; i++) {
      dBiases[i] = dLoss_dOut[i];
      for (let j = 0; j < this.weights[i].length; j++) {
        dWeights[i][j] = dLoss_dOut[i] * input[j];
        dInput[j] += dLoss_dOut[i] * this.weights[i][j];
      }
    }
    return { dInput, dWeights, dBiases };
  }

  update(gradW: number[][], gradB: number[]) {
    this.t++;
    for (let i = 0; i < gradW.length; i++) {
      for (let j = 0; j < gradW[i].length; j++) {
        gradW[i][j] += this.weightDecay * this.weights[i][j];
      }
    }
    for (let i = 0; i < this.weights.length; i++) {
      for (let j = 0; j < this.weights[i].length; j++) {
        this.mW[i][j] =
          this.beta1 * this.mW[i][j] + (1 - this.beta1) * gradW[i][j];
        this.vW[i][j] =
          this.beta2 * this.vW[i][j] +
          (1 - this.beta2) * gradW[i][j] * gradW[i][j];
        const mHat = this.mW[i][j] / (1 - Math.pow(this.beta1, this.t));
        const vHat = this.vW[i][j] / (1 - Math.pow(this.beta2, this.t));
        this.weights[i][j] -= (this.lr * mHat) / (Math.sqrt(vHat) + this.eps);
      }
      this.mb[i] = this.beta1 * this.mb[i] + (1 - this.beta1) * gradB[i];
      this.vb[i] =
        this.beta2 * this.vb[i] + (1 - this.beta2) * gradB[i] * gradB[i];
      const mHat = this.mb[i] / (1 - Math.pow(this.beta1, this.t));
      const vHat = this.vb[i] / (1 - Math.pow(this.beta2, this.t));
      this.biases[i] -= (this.lr * mHat) / (Math.sqrt(vHat) + this.eps);
    }
  }

  getState() {
    return { weights: this.weights, biases: this.biases };
  }

  setState(state: { weights: number[][]; biases: number[] }) {
    this.weights = state.weights;
    this.biases = state.biases;
  }
}
