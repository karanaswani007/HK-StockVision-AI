import { round } from "@/lib/format";
import { FEATURE_LABELS, computeIndicators, featureVector, selectFeatureNames } from "@/lib/market/indicators";
import type { IndicatorPack } from "@/lib/market/indicators";
import { scorePrices, std } from "@/lib/ml/metrics";
import {
  fitBoost,
  fitForest,
  fitLinear,
  mulberry32,
  predictBoost,
  predictForest,
  predictLinear,
  type BoostModel,
  type ForestModel,
  type LinearModel,
} from "@/lib/ml/models";
import { fitRnn, predictRnn } from "@/lib/ml/rnn";
import type { Bar, ModelId, ModelOutput, ModelRun } from "@/lib/types";

const SEQ = 10;

const MODEL_META: Record<ModelId, { name: string; note: string }> = {
  linear: {
    name: "Linear Regression",
    note: "Ridge regression on indicators known at that session's close. Scaling uses the training window only.",
  },
  forest: {
    name: "Random Forest",
    note: "An average of shallow regression trees trained on bootstrap samples of past sessions.",
  },
  xgboost: {
    name: "Gradient Boosting",
    note: "Squared-error boosting with shrinkage. Same family as XGBoost; this is a compact implementation, not the XGBoost library.",
  },
  lstm: {
    name: "LSTM",
    note: "A small long short-term memory net trained from scratch on this symbol's recent daily log returns. It is not a pretrained market model.",
  },
  gru: {
    name: "GRU",
    note: "A small gated recurrent unit trained from scratch on this symbol's recent daily log returns.",
  },
};

const STRATEGY =
  "Evaluation uses a chronological holdout: earlier sessions train the model, later sessions score it. There is no random shuffle. After scoring, the forecast model is refit on the full window. The chart is a recursive rollout — each step predicts the next log return and appends it. The headline price is a separate direct model trained on the full horizon return, so it is not a one-day move multiplied by the number of days. Weekend dates are skipped. Exchange holidays are not. Bands are 1.96 times the one-step test residual, widened by the square root of the step. That is an uncertainty sketch, not a probability.";

type Row = { x: number[]; y: number; close: number; future: number; date: string };
type Predictor = (x: number[]) => number;

export function nextTradingDates(from: string, count: number) {
  const [y, m, d] = from.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const out: string[] = [];
  while (out.length < count) {
    dt.setUTCDate(dt.getUTCDate() + 1);
    const day = dt.getUTCDay();
    if (day === 0 || day === 6) continue;
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

function clipRet(value: number) {
  if (!Number.isFinite(value)) return { value: 0, clipped: true };
  const next = Math.max(-0.12, Math.min(0.12, value));
  return { value: next, clipped: next !== value };
}

function logReturns(bars: Bar[]) {
  const rets = Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    if (bars[i - 1].close > 0 && bars[i].close > 0) rets[i] = Math.log(bars[i].close / bars[i - 1].close);
  }
  return rets as number[];
}

function rowsFrom(bars: Bar[], horizon: number, names: string[], pack: IndicatorPack): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < bars.length - horizon; i++) {
    const x = featureVector(pack, bars, i, names);
    const base = bars[i].close;
    const futurePx = bars[i + horizon].close;
    if (!x || base <= 0 || futurePx <= 0) continue;
    rows.push({ x, y: Math.log(futurePx / base), close: base, future: futurePx, date: bars[i + horizon].date });
  }
  return rows;
}

function sequenceRows(bars: Bar[], horizon: number): Row[] {
  const rets = logReturns(bars);
  const rows: Row[] = [];
  for (let t = SEQ; t < bars.length - horizon; t++) {
    const x: number[] = [];
    for (let k = t - SEQ + 1; k <= t; k++) x.push(rets[k] ?? 0);
    const base = bars[t].close;
    const futurePx = bars[t + horizon].close;
    if (base <= 0 || futurePx <= 0) continue;
    rows.push({ x, y: Math.log(futurePx / base), close: base, future: futurePx, date: bars[t + horizon].date });
  }
  return rows;
}

function split<T>(rows: T[], minTrain: number) {
  const desired = Math.max(20, Math.floor(rows.length * 0.2));
  const testCount = Math.min(desired, rows.length - minTrain);
  if (testCount < 15) return null;
  return { train: rows.slice(0, rows.length - testCount), test: rows.slice(rows.length - testCount) };
}

function evaluate(rows: Row[], predict: Predictor) {
  const actual: number[] = [];
  const predicted: number[] = [];
  const baseline: number[] = [];
  const actualRet: number[] = [];
  const predRet: number[] = [];
  const baseRet: number[] = [];
  const series: { date: string; actual: number; predicted: number }[] = [];
  const residuals: number[] = [];
  for (const row of rows) {
    const yhat = predict(row.x);
    const safe = Number.isFinite(yhat) ? yhat : 0;
    const price = row.close * Math.exp(safe);
    actual.push(row.future);
    predicted.push(price);
    baseline.push(row.close);
    actualRet.push(row.y);
    predRet.push(safe);
    baseRet.push(0);
    series.push({ date: row.date, actual: round(row.future, 4) ?? row.future, predicted: round(price, 4) ?? price });
    residuals.push(price - row.future);
  }
  return {
    metrics: scorePrices(actual, predicted, actualRet, predRet),
    baseline: scorePrices(actual, baseline, actualRet, baseRet),
    series,
    residualStd: std(residuals),
  };
}

function scaleImportance(names: string[], values: number[]) {
  const max = Math.max(0, ...values);
  if (!(max > 0)) return [];
  return names
    .map((key, i) => ({ name: FEATURE_LABELS[key] ?? key, value: round(values[i] / max, 4) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function linearImportance(model: LinearModel, names: string[]) {
  return scaleImportance(names, names.map((_, i) => Math.abs(model.weights[i] ?? 0)));
}

function walkForwardLinear(rows: Row[]) {
  if (rows.length < 120) return null;
  const folds = 4;
  const minTrain = Math.floor(rows.length * 0.5);
  const fold = Math.floor((rows.length - minTrain) / folds);
  if (fold < 8) return null;
  const scores: number[] = [];
  for (let f = 0; f < folds; f++) {
    const cut = minTrain + f * fold;
    const train = rows.slice(0, cut);
    const test = rows.slice(cut, cut + fold);
    const model = fitLinear(train.map((r) => r.x), train.map((r) => r.y));
    scores.push(evaluate(test, (x) => predictLinear(model, x)).metrics.rmse);
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return round(avg, 6);
}

function band(price: number, step: number, sigma: number) {
  const width = 1.96 * (sigma || 0) * Math.sqrt(step);
  return {
    low: round(Math.max(0, price - width), 4) ?? 0,
    high: round(price + width, 4) ?? price,
  };
}

function fitTabular(id: ModelId, X: number[][], y: number[], rng: () => number) {
  if (id === "linear") return { kind: "linear" as const, model: fitLinear(X, y) };
  if (id === "forest") return { kind: "forest" as const, model: fitForest(X, y, rng) };
  return { kind: "xgboost" as const, model: fitBoost(X, y, rng) };
}

function predictTabular(fit: ReturnType<typeof fitTabular>, x: number[]) {
  if (fit.kind === "linear") return predictLinear(fit.model, x);
  if (fit.kind === "forest") return predictForest(fit.model, x);
  return predictBoost(fit.model, x);
}

function importanceOf(fit: ReturnType<typeof fitTabular>, names: string[]) {
  if (fit.kind === "linear") return linearImportance(fit.model as LinearModel, names);
  if (fit.kind === "forest") return scaleImportance(names, (fit.model as ForestModel).importance);
  return scaleImportance(names, (fit.model as BoostModel).importance);
}

function rolloutTabular(bars: Bar[], dates: string[], names: string[], predict: Predictor) {
  const series = bars.map((b) => ({ ...b }));
  let clipped = false;
  const prices: number[] = [];
  for (let s = 0; s < dates.length; s++) {
    const pack = computeIndicators(series);
    const x = featureVector(pack, series, series.length - 1, names);
    if (!x) return null;
    const step = clipRet(predict(x));
    if (step.clipped) clipped = true;
    const prev = series[series.length - 1];
    const close = prev.close * Math.exp(step.value);
    if (!Number.isFinite(close) || close <= 0) return null;
    series.push({
      date: dates[s],
      ts: prev.ts + 86400,
      open: prev.close,
      high: Math.max(prev.close, close),
      low: Math.min(prev.close, close),
      close,
      volume: prev.volume,
    });
    prices.push(close);
  }
  return { prices, clipped };
}

function rolloutSequence(start: number, rets: number[], dates: string[], predict: Predictor) {
  const window = rets.slice(-SEQ);
  let price = start;
  let clipped = false;
  const prices: number[] = [];
  for (let s = 0; s < dates.length; s++) {
    const step = clipRet(predict(window));
    if (step.clipped) clipped = true;
    price *= Math.exp(step.value);
    if (!Number.isFinite(price) || price <= 0) return null;
    prices.push(price);
    window.shift();
    window.push(step.value);
  }
  return { prices, clipped };
}

export function runModel(bars: Bar[], horizon: number, id: ModelId, seed: number): ModelOutput {
  const meta = MODEL_META[id];
  if (bars.length < 80) {
    return { ok: false, id, name: meta.name, error: "Not enough daily history. Choose 6 months or longer." };
  }
  const started = performance.now();
  const warnings: string[] = [];
  const last = bars[bars.length - 1];
  const dates = nextTradingDates(last.date, horizon);
  const neural = id === "lstm" || id === "gru";

  let names: string[] = [];
  let stepRows: Row[] = [];
  let directRows: Row[] = [];
  if (!neural) {
    const selected = selectFeatureNames(bars, horizon);
    names = selected.names;
    stepRows = rowsFrom(bars, 1, names, selected.pack);
    directRows = horizon === 1 ? stepRows : rowsFrom(bars, horizon, names, selected.pack);
    if (stepRows.length > 900) {
      stepRows = stepRows.slice(stepRows.length - 900);
      warnings.push("Training used the most recent 900 eligible sessions.");
    }
    if (directRows.length > 900) directRows = directRows.slice(directRows.length - 900);
  } else {
    stepRows = sequenceRows(bars, 1);
    directRows = horizon === 1 ? stepRows : sequenceRows(bars, horizon);
    if (stepRows.length > 900) stepRows = stepRows.slice(stepRows.length - 900);
  }

  if (stepRows.length < 70 || directRows.length < 70) {
    return { ok: false, id, name: meta.name, error: "Not enough complete sessions after indicator warmup. Choose 1 year or longer." };
  }

  const stepSplit = split(stepRows, 40);
  const directSplit = split(directRows, 40);
  if (!stepSplit || !directSplit) {
    return { ok: false, id, name: meta.name, error: "The test window would be too small. Choose a longer history." };
  }

  const rng = mulberry32(seed);
  let stepPredict: Predictor;
  let directPredict: Predictor;
  let importance: { name: string; value: number }[] = [];
  let walkForwardRmse: number | null = null;
  let stepEval: ReturnType<typeof evaluate>;
  let directEval: ReturnType<typeof evaluate>;

  if (!neural) {
    const stepFit = fitTabular(id, stepSplit.train.map((r) => r.x), stepSplit.train.map((r) => r.y), rng);
    const directFit = horizon === 1 ? stepFit : fitTabular(id, directSplit.train.map((r) => r.x), directSplit.train.map((r) => r.y), mulberry32(seed + 11));
    stepEval = evaluate(stepSplit.test, (x) => predictTabular(stepFit, x));
    directEval = horizon === 1 ? stepEval : evaluate(directSplit.test, (x) => predictTabular(directFit, x));
    const stepAll = fitTabular(id, stepRows.map((r) => r.x), stepRows.map((r) => r.y), mulberry32(seed + 3));
    const directAll = horizon === 1 ? stepAll : fitTabular(id, directRows.map((r) => r.x), directRows.map((r) => r.y), mulberry32(seed + 29));
    stepPredict = (x) => predictTabular(stepAll, x);
    directPredict = (x) => predictTabular(directAll, x);
    importance = importanceOf(directAll, names);
    if (id === "linear") walkForwardRmse = walkForwardLinear(stepRows);
  } else {
    const stepModel = fitRnn(stepSplit.train, id, seed);
    const directModel = horizon === 1 ? stepModel : fitRnn(directSplit.train, id, seed + 17);
    stepEval = evaluate(stepSplit.test, (x) => predictRnn(stepModel, x));
    directEval = horizon === 1 ? stepEval : evaluate(directSplit.test, (x) => predictRnn(directModel, x));
    const stepAll = fitRnn(stepRows, id, seed + 3);
    const directAll = horizon === 1 ? stepAll : fitRnn(directRows, id, seed + 23);
    stepPredict = (x) => predictRnn(stepAll, x);
    directPredict = (x) => predictRnn(directAll, x);
  }

  const sigma = stepEval.residualStd;
  let rollout;
  let directRaw: number;
  if (!neural) {
    rollout = rolloutTabular(bars, dates, names, stepPredict);
    const pack = computeIndicators(bars);
    const xNow = featureVector(pack, bars, bars.length - 1, names);
    if (!xNow) return { ok: false, id, name: meta.name, error: "The latest session does not have a full indicator set yet." };
    directRaw = directPredict(xNow);
  } else {
    const rets = logReturns(bars);
    rollout = rolloutSequence(last.close, rets, dates, stepPredict);
    directRaw = directPredict(rets.slice(-SEQ));
  }
  if (!rollout) return { ok: false, id, name: meta.name, error: "The rollout became numerically unstable on this series." };
  if (rollout.clipped) warnings.push("One or more rollout steps were capped at a 12% daily move to stop a runaway path.");
  if (!Number.isFinite(directRaw)) return { ok: false, id, name: meta.name, error: "The horizon model did not return a finite price." };

  const directPrice = last.close * Math.exp(directRaw);
  if (!Number.isFinite(directPrice) || directPrice <= 0) {
    return { ok: false, id, name: meta.name, error: "The horizon model produced a price that cannot be used." };
  }
  const directChangePct = (directPrice / last.close - 1) * 100;
  if (Math.abs(directChangePct) > 35) {
    warnings.push("The direct horizon estimate is an extreme move versus recent history. Treat it as unstable.");
  }
  const rolloutPrice = rollout.prices[rollout.prices.length - 1];
  const disagreementPct = (Math.abs(directPrice - rolloutPrice) / last.close) * 100;
  if (disagreementPct > 8) {
    warnings.push("The direct horizon estimate and the recursive rollout disagree by more than 8%. That is a sign of uncertainty, not two facts.");
  }

  const directBand = band(directPrice, horizon, sigma || 0);
  const path = dates.map((date, i) => {
    const price = rollout.prices[i];
    const edged = band(price, i + 1, sigma || 0);
    return { date, price: round(price, 4) ?? price, low: edged.low, high: edged.high };
  });

  const beatsBaseline = stepEval.baseline.rmse > 0 && stepEval.metrics.rmse < stepEval.baseline.rmse * 0.98;
  const result: ModelRun = {
    ok: true,
    id,
    name: meta.name,
    note: meta.note,
    anchoredClose: round(last.close, 4) ?? last.close,
    anchorDate: last.date,
    horizon,
    directPrice: round(directPrice, 4) ?? directPrice,
    directChangePct: round(directChangePct, 3) ?? directChangePct,
    directLow: directBand.low,
    directHigh: directBand.high,
    rolloutPrice: round(rolloutPrice, 4) ?? rolloutPrice,
    rolloutChangePct: round((rolloutPrice / last.close - 1) * 100, 3) ?? 0,
    path,
    disagreementPct: round(disagreementPct, 3) ?? disagreementPct,
    oneStep: stepEval.metrics,
    horizonMetrics: directEval.metrics,
    baselineOneStep: stepEval.baseline,
    baselineHorizon: directEval.baseline,
    walkForwardRmse,
    beatsBaseline,
    trainSize: stepSplit.train.length,
    testSize: stepSplit.test.length,
    trainMs: Math.round(performance.now() - started),
    testSeries: stepEval.series.slice(-180),
    importance,
    intervalNote:
      "The shaded-style band is an approximate interval from holdout residuals, widened with the square root of the number of steps. It is not a statistical guarantee and it is not a confidence percentage.",
    strategyNote: STRATEGY,
    warnings,
  };
  if (names.length && names.length < 16) {
    result.warnings = [...result.warnings, "A shorter feature set was used because the longer moving averages were not available on enough sessions."];
  }
  return result;
}

export function hashSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const ALL_MODELS: ModelId[] = ["linear", "forest", "xgboost", "lstm", "gru"];

export function verdictFor(results: ModelOutput[]) {
  const ok = results.filter((r): r is ModelRun => r.ok);
  if (ok.length < 2 || ok.some((r) => r.testSize < 20)) {
    return { winnerId: null, verdict: "Not enough untouched test sessions to rank these models. Read the errors, not a winner." };
  }
  const best = [...ok].sort((a, b) => a.oneStep.rmse - b.oneStep.rmse)[0];
  const baseline = best.baselineOneStep.rmse;
  if (!(baseline > 0) || best.oneStep.rmse > baseline * 0.98) {
    return {
      winnerId: null,
      verdict: "No model beat a persistence baseline (tomorrow equals the last close) by a meaningful margin on next-day test RMSE. Do not treat a small historical gap as an edge.",
    };
  }
  return {
    winnerId: best.id,
    verdict: `${best.name} had the lowest next-day test RMSE on this window and beat persistence. That is a historical score only. It does not mean the model will be right next.`,
  };
}
