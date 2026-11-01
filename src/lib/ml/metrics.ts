import type { Metrics } from "@/lib/types";
import { round } from "@/lib/format";

export function scorePrices(actual: number[], predicted: number[], actualRet: number[], predRet: number[]): Metrics {
  const n = actual.length;
  if (!n || n !== predicted.length) {
    return { mae: 0, mse: 0, rmse: 0, mape: null, r2: null, directionalAccuracy: null };
  }
  let abs = 0;
  let sq = 0;
  let mapeSum = 0;
  let mapeN = 0;
  let sumA = 0;
  for (let i = 0; i < n; i++) {
    const e = predicted[i] - actual[i];
    abs += Math.abs(e);
    sq += e * e;
    sumA += actual[i];
    if (Math.abs(actual[i]) > 1e-8) {
      mapeSum += Math.abs(e / actual[i]);
      mapeN++;
    }
  }
  const mean = sumA / n;
  let ssTot = 0;
  for (let i = 0; i < n; i++) ssTot += (actual[i] - mean) ** 2;
  const mse = sq / n;
  let dirHit = 0;
  let dirN = 0;
  for (let i = 0; i < actualRet.length; i++) {
    if (!Number.isFinite(actualRet[i]) || !Number.isFinite(predRet[i])) continue;
    if (Math.abs(actualRet[i]) < 1e-8) continue;
    if (Math.sign(predRet[i]) === 0) continue;
    dirN++;
    if (Math.sign(actualRet[i]) === Math.sign(predRet[i])) dirHit++;
  }
  return {
    mae: round(abs / n, 6) ?? 0,
    mse: round(mse, 6) ?? 0,
    rmse: round(Math.sqrt(mse), 6) ?? 0,
    mape: mapeN ? round((mapeSum / mapeN) * 100, 4) : null,
    r2: ssTot > 1e-12 ? round(1 - sq / ssTot, 4) : null,
    directionalAccuracy: dirN ? round(dirHit / dirN, 4) : null,
  };
}

export function std(values: number[]) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(v);
}
