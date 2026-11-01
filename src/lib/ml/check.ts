import { computeIndicators, featureVector, selectFeatureNames } from "@/lib/market/indicators";
import { runModel } from "@/lib/ml/engine";
import type { Bar, ModelId } from "@/lib/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function make(n: number, priceAt: (i: number) => number): Bar[] {
  const start = Date.UTC(2019, 0, 1);
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const close = priceAt(i);
    bars.push({
      date: new Date(start + i * 86400000).toISOString().slice(0, 10),
      ts: (start + i * 86400000) / 1000,
      open: close * 0.997,
      high: close * 1.004,
      low: close * 0.994,
      close,
      volume: 1_000_000 + i,
    });
  }
  return bars;
}

export async function selfCheck() {
  const rising = make(40, (i) => i + 10);
  const pack = computeIndicators(rising);
  assert(pack.rsi14[20] === 100, `expected RSI 100, got ${pack.rsi14[20]}`);
  assert(pack.sma10[9] != null && Math.abs((pack.sma10[9] as number) - 14.5) < 1e-9, "sma10");

  const base = make(180, (i) => 50 + i * 0.2 + Math.sin(i / 5));
  const selected = selectFeatureNames(base, 5);
  const before = featureVector(selected.pack, base, 90, selected.names);
  const mutated = base.map((bar, i) => (i < 140 ? bar : { ...bar, close: bar.close * 2, high: bar.high * 2, low: bar.low * 2, open: bar.open * 2 }));
  const afterPack = computeIndicators(mutated);
  const after = featureVector(afterPack, mutated, 90, selected.names);
  assert(before && after && JSON.stringify(before) === JSON.stringify(after), "feature leakage from the future");

  const trend = make(240, (i) => 100 * 1.003 ** i);
  const linear = runModel(trend, 5, "linear", 7);
  assert(linear.ok, linear.ok ? "" : linear.error);
  if (linear.ok) {
    assert(linear.path.length === 5, "horizon path");
    assert(linear.oneStep.rmse < linear.baselineOneStep.rmse * 0.5, `linear failed to beat persistence ${linear.oneStep.rmse} vs ${linear.baselineOneStep.rmse}`);
    assert(linear.directPrice > linear.anchoredClose, "trend forecast should rise");
    assert(linear.anchorDate === trend[trend.length - 1].date, "anchor date");
  }

  const noisy = make(280, (i) => 70 * 1.001 ** i * (1 + 0.012 * Math.sin(i / 4)));
  for (const id of ["forest", "xgboost", "lstm", "gru"] as ModelId[]) {
    const started = Date.now();
    const out = runModel(noisy, 5, id, 99);
    console.log(id, out.ok ? `${out.trainMs}ms rmse ${out.oneStep.rmse} base ${out.baselineOneStep.rmse}` : out.error, "wall", Date.now() - started);
    assert(out.ok, `${id} ${out.ok ? "" : out.error}`);
    if (out.ok) assert(out.path.length === 5 && out.path.every((p) => p.price > 0 && p.low <= p.price && p.high >= p.price), `${id} path`);
  }
  return "ok";
}
