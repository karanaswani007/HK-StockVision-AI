import { fitTree, predictTree, type Tree } from "@/lib/ml/tree";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type LinearModel = { weights: number[]; mu: number[]; sigma: number[] };

function solve(aIn: number[][], bIn: number[]) {
  const n = bIn.length;
  const M = aIn.map((row, i) => [...row, bIn[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const div = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

export function fitLinear(X: number[][], y: number[], lambda = 2): LinearModel {
  const n = X.length;
  const p = X[0].length;
  const mu = Array(p).fill(0);
  const sigma = Array(p).fill(1);
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += X[i][j];
    mu[j] = s / n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (X[i][j] - mu[j]) ** 2;
    sigma[j] = Math.sqrt(v / n) || 1;
  }
  const dim = p + 1;
  const A = Array.from({ length: dim }, () => Array(dim).fill(0));
  const b = Array(dim).fill(0);
  for (let i = 0; i < n; i++) {
    const row = X[i].map((v, j) => (v - mu[j]) / sigma[j]);
    row.push(1);
    for (let c = 0; c < dim; c++) {
      b[c] += row[c] * y[i];
      for (let d = 0; d < dim; d++) A[c][d] += row[c] * row[d];
    }
  }
  for (let c = 0; c < dim; c++) A[c][c] += c === dim - 1 ? 1e-8 : lambda;
  const weights = solve(A, b) ?? Array(dim).fill(0);
  return { weights, mu, sigma };
}

export function predictLinear(model: LinearModel, x: number[]) {
  let s = model.weights[model.weights.length - 1] ?? 0;
  for (let j = 0; j < x.length; j++) s += (model.weights[j] ?? 0) * ((x[j] - model.mu[j]) / (model.sigma[j] || 1));
  return s;
}

export type ForestModel = { trees: Tree[]; importance: number[] };

export function fitForest(X: number[][], y: number[], rng: () => number, trees = 18): ForestModel {
  const n = X.length;
  const p = X[0].length;
  const importance = Array(p).fill(0);
  const modelTrees: Tree[] = [];
  const featCount = Math.max(3, Math.floor(p * 0.6));
  for (let t = 0; t < trees; t++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(Math.floor(rng() * n));
    const fit = fitTree(X, y, idx, { maxDepth: 5, minLeaf: 6, featureCount: featCount, rng });
    modelTrees.push(fit.root);
    for (let j = 0; j < p; j++) importance[j] += fit.importance[j];
  }
  return { trees: modelTrees, importance };
}

export function predictForest(model: ForestModel, x: number[]) {
  let s = 0;
  for (const tree of model.trees) s += predictTree(tree, x);
  return s / model.trees.length;
}

export type BoostModel = { mean: number; trees: Tree[]; lr: number; importance: number[] };

export function fitBoost(X: number[][], y: number[], rng: () => number, rounds = 28): BoostModel {
  const n = X.length;
  const p = X[0].length;
  const mean = y.reduce((a, b) => a + b, 0) / n;
  const pred = Array(n).fill(mean);
  const trees: Tree[] = [];
  const importance = Array(p).fill(0);
  const lr = 0.08;
  const idx = X.map((_, i) => i);
  for (let m = 0; m < rounds; m++) {
    const resid = y.map((v, i) => v - pred[i]);
    const fit = fitTree(X, resid, idx, { maxDepth: 3, minLeaf: 8, featureCount: Math.max(3, Math.floor(p * 0.75)), rng });
    trees.push(fit.root);
    for (let j = 0; j < p; j++) importance[j] += fit.importance[j];
    for (let i = 0; i < n; i++) pred[i] += lr * predictTree(fit.root, X[i]);
  }
  return { mean, trees, lr, importance };
}

export function predictBoost(model: BoostModel, x: number[]) {
  let s = model.mean;
  for (const tree of model.trees) s += model.lr * predictTree(tree, x);
  return s;
}
