/*
  Warnings:

  - Added the required column `updatedAt` to the `TrainingRun` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrainingRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "circuitId" TEXT,
    "dataset" TEXT NOT NULL,
    "epochs" INTEGER NOT NULL,
    "learningRate" REAL NOT NULL,
    "bondDim" INTEGER NOT NULL,
    "qubitsCount" INTEGER,
    "gates" JSONB,
    "status" TEXT NOT NULL,
    "metrics" JSONB,
    "finalAccuracy" REAL,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrainingRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TrainingRun" ("bondDim", "circuitId", "createdAt", "dataset", "epochs", "finalAccuracy", "finishedAt", "id", "learningRate", "metrics", "projectId", "startedAt", "status") SELECT "bondDim", "circuitId", "createdAt", "dataset", "epochs", "finalAccuracy", "finishedAt", "id", "learningRate", "metrics", "projectId", "startedAt", "status" FROM "TrainingRun";
DROP TABLE "TrainingRun";
ALTER TABLE "new_TrainingRun" RENAME TO "TrainingRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
