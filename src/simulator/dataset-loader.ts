import * as fs from 'fs';
import * as path from 'path';

interface LoadOptions {
  targetColumn?: string | number;
  header?: 'auto' | boolean;
  classification?: boolean;
  splitRatio?: number;
  fillNa?: 'drop' | 'mean' | 'mode';
}

export async function loadDatasetUniversal(
  filePath: string,
  options: LoadOptions = {},
): Promise<{
  xTrain: number[][];
  yTrain: number[][];
  xVal: number[][];
  yVal: number[][];
}> {
  const {
    targetColumn = -1,
    header = 'auto',
    classification = true,
    splitRatio = 0.8,
    fillNa = 'drop',
  } = options;

  console.log(`[loadDataset] Loading CSV: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const csv = fs.readFileSync(filePath, 'utf8');
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error('Empty CSV file');

  let hasHeader = false;
  if (header === 'auto') {
    const firstLine = lines[0];
    const looksLikeHeader =
      /[a-zA-Zа-яА-Я]/u.test(firstLine) &&
      !/^\s*[\d\.\-,]+\s*$/.test(firstLine);
    hasHeader = looksLikeHeader;
  } else {
    hasHeader = header === true;
  }

  let dataLines = lines;
  let columnNames: string[] = [];
  if (hasHeader) {
    columnNames = lines[0].split(',').map((s) => s.trim());
    dataLines = lines.slice(1);
    console.log(`[loadDataset] Header detected: ${columnNames.join(', ')}`);
  } else {
    const firstLineParts = lines[0].split(',');
    columnNames = firstLineParts.map((_, idx) => `col${idx}`);
  }

  const numCols = columnNames.length;
  const rawRows: any[][] = [];
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length !== numCols) {
      console.warn(
        `[loadDataset] Line ${i + 2}: expected ${numCols} columns, got ${parts.length}, skipping`,
      );
      continue;
    }
    const parsedRow: any[] = [];
    let hasNa = false;
    for (let j = 0; j < parts.length; j++) {
      let val: any = parts[j];
      if (val === '') {
        hasNa = true;
        break;
      }
      const num = parseFloat(val);
      if (!isNaN(num) && isFinite(num) && val.trim() !== '') {
        parsedRow.push(num);
      } else {
        parsedRow.push(val);
      }
    }
    if (fillNa === 'drop' && hasNa) {
      console.warn(
        `[loadDataset] Line ${i + 2} contains empty fields, skipping`,
      );
      continue;
    }
    if (!hasNa) rawRows.push(parsedRow);
  }

  if (rawRows.length === 0)
    throw new Error('No valid data rows found after cleaning');

  let targetIdx: number;
  if (typeof targetColumn === 'string') {
    targetIdx = columnNames.indexOf(targetColumn);
    if (targetIdx === -1)
      throw new Error(`Target column "${targetColumn}" not found`);
  } else if (typeof targetColumn === 'number') {
    targetIdx = targetColumn >= 0 ? targetColumn : numCols + targetColumn;
    if (targetIdx < 0 || targetIdx >= numCols)
      throw new Error(`Target index ${targetColumn} out of range`);
  } else {
    targetIdx = numCols - 1;
  }

  console.log(
    `[loadDataset] Target column: ${columnNames[targetIdx]} (index ${targetIdx})`,
  );

  const allFeaturesRaw: any[][] = rawRows.map((row) =>
    row.filter((_, idx) => idx !== targetIdx),
  );
  const allTargetsRaw: any[] = rawRows.map((row) => row[targetIdx]);

  const numFeatureCols = allFeaturesRaw[0].length;
  const isNumericFeature: boolean[] = new Array(numFeatureCols).fill(false);
  for (let col = 0; col < numFeatureCols; col++) {
    const allNumbers = allFeaturesRaw.every(
      (row) => typeof row[col] === 'number',
    );
    isNumericFeature[col] = allNumbers;
  }

  let encodedFeatureWidth = 0;
  const colEncodedOffsets: {
    start: number;
    length: number;
    isNumeric: boolean;
  }[] = [];

  for (let col = 0; col < numFeatureCols; col++) {
    if (isNumericFeature[col]) {
      colEncodedOffsets.push({
        start: encodedFeatureWidth,
        length: 1,
        isNumeric: true,
      });
      encodedFeatureWidth += 1;
    } else {
      const uniqueVals = [...new Set(allFeaturesRaw.map((row) => row[col]))];
      colEncodedOffsets.push({
        start: encodedFeatureWidth,
        length: uniqueVals.length,
        isNumeric: false,
      });
      encodedFeatureWidth += uniqueVals.length;
    }
  }

  const X: number[][] = allFeaturesRaw.map((row) => {
    const encodedRow = new Array(encodedFeatureWidth).fill(0);
    for (let col = 0; col < numFeatureCols; col++) {
      const offset = colEncodedOffsets[col];
      if (offset.isNumeric) {
        encodedRow[offset.start] = row[col] as number;
      } else {
        const val = row[col];
        const uniqueVals = [...new Set(allFeaturesRaw.map((r) => r[col]))];
        const idx = uniqueVals.indexOf(val);
        if (idx !== -1) encodedRow[offset.start + idx] = 1;
      }
    }
    return encodedRow;
  });

  for (let col = 0; col < numFeatureCols; col++) {
    if (isNumericFeature[col]) {
      const offset = colEncodedOffsets[col];
      const values = X.map((row) => row[offset.start]);
      const min = Math.min(...values);
      const max = Math.max(...values);
      if (max - min > 1e-8) {
        for (let i = 0; i < X.length; i++) {
          X[i][offset.start] = (X[i][offset.start] - min) / (max - min);
        }
      } else {
        for (let i = 0; i < X.length; i++) X[i][offset.start] = 0;
      }
    }
  }

  let Y: number[][];
  if (classification) {
    const uniqueTargets = [...new Set(allTargetsRaw)];
    console.log(
      `[loadDataset] Target classes (${uniqueTargets.length}): ${uniqueTargets.join(', ')}`,
    );
    Y = allTargetsRaw.map((t) => {
      const oh = new Array(uniqueTargets.length).fill(0);
      oh[uniqueTargets.indexOf(t)] = 1;
      return oh;
    });
  } else {
    Y = allTargetsRaw.map((t) => {
      const num = typeof t === 'number' ? t : parseFloat(t);
      if (isNaN(num)) throw new Error(`Non-numeric target value: ${t}`);
      return [num];
    });
  }

  const indices = Array.from({ length: X.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const shuffledX = indices.map((i) => X[i]);
  const shuffledY = indices.map((i) => Y[i]);

  const split = Math.floor(shuffledX.length * splitRatio);
  console.log(
    `[loadDataset] Train size: ${split}, Val size: ${shuffledX.length - split}`,
  );

  return {
    xTrain: shuffledX.slice(0, split),
    yTrain: shuffledY.slice(0, split),
    xVal: shuffledX.slice(split),
    yVal: shuffledY.slice(split),
  };
}

export async function loadDataset(name: string): Promise<{
  xTrain: number[][];
  yTrain: number[][];
  xVal: number[][];
  yVal: number[][];
}> {
  if (name === 'Iris') {
    const csvPath = path.join(process.cwd(), 'assets', 'job.csv');
    console.log(`[loadDataset] Loading Iris (student.csv) from ${csvPath}`);
    return await loadDatasetUniversal(csvPath, {
      targetColumn: -1,
      classification: true,
      splitRatio: 0.8,
      header: 'auto',
    });
  } else if (name === 'MNIST') {
    const trainSize = 500;
    const valSize = 100;
    const inputDim = 784;
    const numClasses = 10;
    const xTrain = Array(trainSize)
      .fill(0)
      .map(() =>
        Array(inputDim)
          .fill(0)
          .map(() => Math.random()),
      );
    const yTrain = Array(trainSize)
      .fill(0)
      .map(() => {
        const oh = new Array(numClasses).fill(0);
        oh[Math.floor(Math.random() * numClasses)] = 1;
        return oh;
      });
    const xVal = Array(valSize)
      .fill(0)
      .map(() =>
        Array(inputDim)
          .fill(0)
          .map(() => Math.random()),
      );
    const yVal = Array(valSize)
      .fill(0)
      .map(() => {
        const oh = new Array(numClasses).fill(0);
        oh[Math.floor(Math.random() * numClasses)] = 1;
        return oh;
      });
    return { xTrain, yTrain, xVal, yVal };
  }
  throw new Error(`Unknown dataset: ${name}`);
}
