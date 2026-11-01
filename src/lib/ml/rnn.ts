import { mulberry32 } from "@/lib/ml/models";

export type RnnModel = {
  kind: "lstm" | "gru";
  hidden: number;
  sd: number;
  W: number[][];
  U: number[][];
  b: number[][];
  wy: number[];
  by: number;
};

const HIDDEN = 8;
const EPOCHS = 8;
const LR = 0.01;

function sigmoid(x: number) {
  if (x > 20) return 1;
  if (x < -20) return 0;
  return 1 / (1 + Math.exp(-x));
}

function zeros(n: number) {
  return Array(n).fill(0);
}

function matVec(U: number[], h: number[], hidden: number) {
  const out = zeros(hidden);
  for (let i = 0; i < hidden; i++) {
    let s = 0;
    const row = i * hidden;
    for (let j = 0; j < hidden; j++) s += U[row + j] * h[j];
    out[i] = s;
  }
  return out;
}

function addScaled(dst: number[], src: number[], scale = 1) {
  for (let i = 0; i < dst.length; i++) dst[i] += src[i] * scale;
}

function clipInPlace(groups: number[][], maxNorm = 1) {
  let ss = 0;
  for (const g of groups) for (const v of g) ss += v * v;
  const norm = Math.sqrt(ss);
  if (norm > maxNorm) {
    const s = maxNorm / (norm || 1);
    for (const g of groups) for (let i = 0; i < g.length; i++) g[i] *= s;
  }
}

type AdamState = { m: number[]; v: number[]; t: number };

function adam(param: number[], grad: number[], state: AdamState, lr: number) {
  state.t += 1;
  const b1 = 0.9;
  const b2 = 0.999;
  for (let i = 0; i < param.length; i++) {
    state.m[i] = b1 * state.m[i] + (1 - b1) * grad[i];
    state.v[i] = b2 * state.v[i] + (1 - b2) * grad[i] * grad[i];
    const mh = state.m[i] / (1 - b1 ** state.t);
    const vh = state.v[i] / (1 - b2 ** state.t);
    param[i] -= (lr * mh) / (Math.sqrt(vh) + 1e-8);
    grad[i] = 0;
  }
}

function initVec(n: number, rng: () => number, scale = 0.08) {
  return Array.from({ length: n }, () => (rng() * 2 - 1) * scale);
}

export function fitRnn(samplesIn: { x: number[]; y: number }[], kind: "lstm" | "gru", seed: number): RnnModel {
  const rng = mulberry32(seed);
  const hidden = HIDDEN;
  const samples = samplesIn.length > 140 ? samplesIn.slice(samplesIn.length - 140) : samplesIn;
  let ss = 0;
  let count = 0;
  for (const s of samples) for (const v of s.x) {
    ss += v * v;
    count++;
  }
  const sd = Math.sqrt(ss / Math.max(1, count)) || 1;
  const scaled = samples.map((s) => ({ x: s.x.map((v) => v / sd), y: s.y / sd }));

  const gates = 4;
  const W = Array.from({ length: gates }, () => initVec(hidden, rng));
  const U = Array.from({ length: gates }, () => initVec(hidden * hidden, rng));
  const b = Array.from({ length: gates }, () => zeros(hidden));
  if (kind === "lstm") for (let i = 0; i < hidden; i++) b[1][i] = 1;
  const wy = initVec(hidden, rng);
  let by = 0;

  const gW = W.map((v) => zeros(v.length));
  const gU = U.map((v) => zeros(v.length));
  const gb = b.map((v) => zeros(v.length));
  const gwy = zeros(hidden);
  let gby = 0;
  const optW = W.map((v) => ({ m: zeros(v.length), v: zeros(v.length), t: 0 }));
  const optU = U.map((v) => ({ m: zeros(v.length), v: zeros(v.length), t: 0 }));
  const optb = b.map((v) => ({ m: zeros(v.length), v: zeros(v.length), t: 0 }));
  const optwy: AdamState = { m: zeros(hidden), v: zeros(hidden), t: 0 };
  const optby: AdamState = { m: [0], v: [0], t: 0 };

  function predictRaw(seq: number[]) {
    let h = zeros(hidden);
    let c = zeros(hidden);
    for (const x of seq) {
      if (kind === "lstm") {
        const i = W[0].map((w, k) => sigmoid(w * x + matVec(U[0], h, hidden)[k] + b[0][k]));
        const f = W[1].map((w, k) => sigmoid(w * x + matVec(U[1], h, hidden)[k] + b[1][k]));
        const g = W[2].map((w, k) => Math.tanh(w * x + matVec(U[2], h, hidden)[k] + b[2][k]));
        const o = W[3].map((w, k) => sigmoid(w * x + matVec(U[3], h, hidden)[k] + b[3][k]));
        c = c.map((cv, k) => f[k] * cv + i[k] * g[k]);
        h = o.map((ov, k) => ov * Math.tanh(c[k]));
      } else {
        const z = W[0].map((w, k) => sigmoid(w * x + matVec(U[0], h, hidden)[k] + b[0][k]));
        const r = W[1].map((w, k) => sigmoid(w * x + matVec(U[1], h, hidden)[k] + b[1][k]));
        const rh = r.map((rv, k) => rv * h[k]);
        const hhat = W[2].map((w, k) => Math.tanh(w * x + matVec(U[2], rh, hidden)[k] + b[2][k]));
        h = h.map((hv, k) => (1 - z[k]) * hv + z[k] * hhat[k]);
      }
    }
    let y = by;
    for (let k = 0; k < hidden; k++) y += wy[k] * h[k];
    return y;
  }

  function trainOne(seq: number[], target: number) {
    const T = seq.length;
    const hs: number[][] = [];
    const cs: number[][] = [];
    const gatesA: number[][][] = [];
    const rhs: number[][] = [];
    let h = zeros(hidden);
    let c = zeros(hidden);
    for (let t = 0; t < T; t++) {
      const x = seq[t];
      const gp: number[][] = [];
      if (kind === "lstm") {
        const pre = [0, 1, 2, 3].map((gi) => W[gi].map((w, k) => w * x + matVec(U[gi], h, hidden)[k] + b[gi][k]));
        const i = pre[0].map(sigmoid);
        const f = pre[1].map(sigmoid);
        const g = pre[2].map(Math.tanh);
        const o = pre[3].map(sigmoid);
        gp.push(i, f, g, o);
        c = c.map((cv, k) => f[k] * cv + i[k] * g[k]);
        h = o.map((ov, k) => ov * Math.tanh(c[k]));
      } else {
        const zpre = W[0].map((w, k) => w * x + matVec(U[0], h, hidden)[k] + b[0][k]);
        const rpre = W[1].map((w, k) => w * x + matVec(U[1], h, hidden)[k] + b[1][k]);
        const z = zpre.map(sigmoid);
        const r = rpre.map(sigmoid);
        const rh = r.map((rv, k) => rv * h[k]);
        const hpre = W[2].map((w, k) => w * x + matVec(U[2], rh, hidden)[k] + b[2][k]);
        const hhat = hpre.map(Math.tanh);
        gp.push(z, r, hhat, zeros(hidden));
        rhs.push(rh);
        h = h.map((hv, k) => (1 - z[k]) * hv + z[k] * hhat[k]);
      }
      hs.push(h);
      cs.push(c);
      gatesA.push(gp);
    }
    let yHat = by;
    const hT = hs[T - 1];
    for (let k = 0; k < hidden; k++) yHat += wy[k] * hT[k];
    const dy = yHat - target;
    gby += dy;
    for (let k = 0; k < hidden; k++) gwy[k] += dy * hT[k];
    let dH = wy.map((w) => w * dy);
    let dC = zeros(hidden);

    for (let t = T - 1; t >= 0; t--) {
      const x = seq[t];
      const hPrev = t === 0 ? zeros(hidden) : hs[t - 1];
      const cPrev = t === 0 ? zeros(hidden) : cs[t - 1];
      const gp = gatesA[t];
      const dHprev = zeros(hidden);
      if (kind === "lstm") {
        const [i, f, g, o] = gp;
        const cNow = cs[t];
        const tanhC = cNow.map(Math.tanh);
        const dO = dH.map((v, k) => v * tanhC[k]);
        const dTanh = dH.map((v, k) => v * o[k]);
        const dCt = dC.map((v, k) => v + dTanh[k] * (1 - tanhC[k] ** 2));
        const dF = dCt.map((v, k) => v * cPrev[k]);
        const dI = dCt.map((v, k) => v * g[k]);
        const dG = dCt.map((v, k) => v * i[k]);
        dC = dCt.map((v, k) => v * f[k]);
        const dPre = [
          dI.map((v, k) => v * i[k] * (1 - i[k])),
          dF.map((v, k) => v * f[k] * (1 - f[k])),
          dG.map((v, k) => v * (1 - g[k] ** 2)),
          dO.map((v, k) => v * o[k] * (1 - o[k])),
        ];
        for (let gi = 0; gi < 4; gi++) {
          for (let k = 0; k < hidden; k++) {
            gW[gi][k] += dPre[gi][k] * x;
            gb[gi][k] += dPre[gi][k];
            for (let j = 0; j < hidden; j++) gU[gi][k * hidden + j] += dPre[gi][k] * hPrev[j];
          }
          for (let j = 0; j < hidden; j++) {
            let s = 0;
            for (let k = 0; k < hidden; k++) s += U[gi][k * hidden + j] * dPre[gi][k];
            dHprev[j] += s;
          }
        }
      } else {
        const z = gp[0];
        const r = gp[1];
        const hhat = gp[2];
        const rh = rhs[t];
        const dZ = dH.map((v, k) => v * (hhat[k] - hPrev[k]));
        const dHhat = dH.map((v, k) => v * z[k]);
        for (let k = 0; k < hidden; k++) dHprev[k] += dH[k] * (1 - z[k]);
        const dZpre = dZ.map((v, k) => v * z[k] * (1 - z[k]));
        const dHpre = dHhat.map((v, k) => v * (1 - hhat[k] ** 2));
        const dRh = matVecT(U[2], dHpre, hidden);
        const dR = dRh.map((v, k) => v * hPrev[k]);
        for (let k = 0; k < hidden; k++) dHprev[k] += dRh[k] * r[k];
        const dRpre = dR.map((v, k) => v * r[k] * (1 - r[k]));
        const pres = [dZpre, dRpre, dHpre];
        const hsUse = [hPrev, hPrev, rh];
        for (let gi = 0; gi < 3; gi++) {
          for (let k = 0; k < hidden; k++) {
            gW[gi][k] += pres[gi][k] * x;
            gb[gi][k] += pres[gi][k];
            for (let j = 0; j < hidden; j++) gU[gi][k * hidden + j] += pres[gi][k] * hsUse[gi][j];
          }
          for (let j = 0; j < hidden; j++) {
            let s = 0;
            for (let k = 0; k < hidden; k++) s += U[gi][k * hidden + j] * pres[gi][k];
            if (gi < 2) dHprev[j] += s;
          }
        }
      }
      dH = dHprev;
    }
    return dy * dy;
  }

  let bestLoss = Infinity;
  let best: { W: number[][]; U: number[][]; b: number[][]; wy: number[]; by: number } | null = null;
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    let loss = 0;
    const order = scaled.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const ix of order) {
      loss += trainOne(scaled[ix].x, scaled[ix].y);
      clipInPlace([...gW, ...gU, ...gb, gwy, [gby]]);
      for (let gi = 0; gi < gates; gi++) {
        adam(W[gi], gW[gi], optW[gi], LR);
        adam(U[gi], gU[gi], optU[gi], LR);
        adam(b[gi], gb[gi], optb[gi], LR);
      }
      adam(wy, gwy, optwy, LR);
      const byArr = [by];
      const gbyArr = [gby];
      adam(byArr, gbyArr, optby, LR);
      by = byArr[0];
      gby = 0;
    }
    loss /= scaled.length;
    if (loss < bestLoss) {
      bestLoss = loss;
      best = {
        W: W.map((v) => v.slice()),
        U: U.map((v) => v.slice()),
        b: b.map((v) => v.slice()),
        wy: wy.slice(),
        by,
      };
    }
  }
  const chosen = best ?? { W, U, b, wy, by };
  return { kind, hidden, sd, ...chosen };
}

function matVecT(U: number[], v: number[], hidden: number) {
  const out = zeros(hidden);
  for (let j = 0; j < hidden; j++) {
    let s = 0;
    for (let k = 0; k < hidden; k++) s += U[k * hidden + j] * v[k];
    out[j] = s;
  }
  return out;
}

export function predictRnn(model: RnnModel, seqRaw: number[]) {
  const seq = seqRaw.map((v) => v / model.sd);
  const hidden = model.hidden;
  let h = zeros(hidden);
  let c = zeros(hidden);
  for (const x of seq) {
    if (model.kind === "lstm") {
      const gates = [0, 1, 2, 3].map((gi) =>
        model.W[gi].map((w, k) => w * x + matVec(model.U[gi], h, hidden)[k] + model.b[gi][k]),
      );
      const i = gates[0].map(sigmoid);
      const f = gates[1].map(sigmoid);
      const g = gates[2].map(Math.tanh);
      const o = gates[3].map(sigmoid);
      c = c.map((cv, k) => f[k] * cv + i[k] * g[k]);
      h = o.map((ov, k) => ov * Math.tanh(c[k]));
    } else {
      const z = model.W[0].map((w, k) => sigmoid(w * x + matVec(model.U[0], h, hidden)[k] + model.b[0][k]));
      const r = model.W[1].map((w, k) => sigmoid(w * x + matVec(model.U[1], h, hidden)[k] + model.b[1][k]));
      const rh = r.map((rv, k) => rv * h[k]);
      const hhat = model.W[2].map((w, k) => Math.tanh(w * x + matVec(model.U[2], rh, hidden)[k] + model.b[2][k]));
      h = h.map((hv, k) => (1 - z[k]) * hv + z[k] * hhat[k]);
    }
  }
  let y = model.by;
  for (let k = 0; k < hidden; k++) y += model.wy[k] * h[k];
  return y * model.sd;
}
