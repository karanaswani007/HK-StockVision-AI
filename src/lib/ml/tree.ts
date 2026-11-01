export type Tree = {
  value: number;
  feature?: number;
  threshold?: number;
  left?: Tree;
  right?: Tree;
};

export type TreeFit = { root: Tree; importance: number[] };

function meanOf(y: number[], idx: number[]) {
  let s = 0;
  for (const i of idx) s += y[i];
  return s / idx.length;
}

function sse(y: number[], idx: number[], mean: number) {
  let e = 0;
  for (const i of idx) {
    const d = y[i] - mean;
    e += d * d;
  }
  return e;
}

function sampleFeatures(p: number, count: number, rng: () => number) {
  const all = Array.from({ length: p }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(count, p));
}

export function fitTree(
  X: number[][],
  y: number[],
  indices: number[],
  opts: { maxDepth: number; minLeaf: number; featureCount: number; rng: () => number },
): TreeFit {
  const p = X[0]?.length ?? 0;
  const importance = Array(p).fill(0);

  function build(idx: number[], depth: number): Tree {
    const mean = meanOf(y, idx);
    if (idx.length < opts.minLeaf * 2 || depth >= opts.maxDepth) return { value: mean };
    const parent = sse(y, idx, mean);
    const features = sampleFeatures(p, opts.featureCount, opts.rng);
    let best: { feature: number; threshold: number; gain: number; left: number[]; right: number[] } | null = null;
    for (const f of features) {
      const vals = idx.map((i) => X[i][f]).sort((a, b) => a - b);
      const cuts: number[] = [];
      const steps = 8;
      for (let s = 1; s < steps; s++) {
        const v = vals[Math.floor(((vals.length - 1) * s) / steps)];
        if (cuts.length === 0 || Math.abs(cuts[cuts.length - 1] - v) > 1e-12) cuts.push(v);
      }
      for (const thr of cuts) {
        const left: number[] = [];
        const right: number[] = [];
        for (const i of idx) (X[i][f] <= thr ? left : right).push(i);
        if (left.length < opts.minLeaf || right.length < opts.minLeaf) continue;
        const gain = parent - sse(y, left, meanOf(y, left)) - sse(y, right, meanOf(y, right));
        if (gain > 1e-12 && (!best || gain > best.gain)) best = { feature: f, threshold: thr, gain, left, right };
      }
    }
    if (!best) return { value: mean };
    importance[best.feature] += best.gain;
    return {
      value: mean,
      feature: best.feature,
      threshold: best.threshold,
      left: build(best.left, depth + 1),
      right: build(best.right, depth + 1),
    };
  }

  return { root: build(indices, 0), importance };
}

export function predictTree(node: Tree, x: number[]): number {
  let n = node;
  while (n.left && n.right && n.feature !== undefined && n.threshold !== undefined) {
    n = x[n.feature] <= n.threshold ? n.left : n.right;
  }
  return n.value;
}
