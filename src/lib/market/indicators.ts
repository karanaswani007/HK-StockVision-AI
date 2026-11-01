import type { Bar } from "@/lib/types";

export type IndicatorPack = {
  sma10: (number | null)[];
  sma20: (number | null)[];
  sma50: (number | null)[];
  sma100: (number | null)[];
  sma200: (number | null)[];
  ema12: (number | null)[];
  ema26: (number | null)[];
  macd: (number | null)[];
  macdSignal: (number | null)[];
  macdHist: (number | null)[];
  rsi14: (number | null)[];
  stochK: (number | null)[];
  stochD: (number | null)[];
  roc12: (number | null)[];
  bbMid: (number | null)[];
  bbUpper: (number | null)[];
  bbLower: (number | null)[];
  bbPct: (number | null)[];
  atr14: (number | null)[];
  rollStd20: (number | null)[];
  volSma20: (number | null)[];
  obv: (number | null)[];
  volChange: (number | null)[];
  ret1: (number | null)[];
  ret5: (number | null)[];
  ret10: (number | null)[];
  logRet: (number | null)[];
  hlPct: (number | null)[];
  ocPct: (number | null)[];
};

function sma(values: number[], period: number) {
  const out: (number | null)[] = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values: number[], period: number) {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function emaSparse(values: (number | null)[], period: number) {
  const out: (number | null)[] = Array(values.length).fill(null);
  const k = 2 / (period + 1);
  const seed: number[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    if (prev == null) {
      seed.push(v);
      if (seed.length === period) {
        prev = seed.reduce((a, b) => a + b, 0) / period;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsi(closes: number[], period = 14) {
  const out: (number | null)[] = Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

function rollingStd(values: (number | null)[], period: number) {
  const out: (number | null)[] = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const window: number[] = [];
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (v == null || !Number.isFinite(v)) {
        window.length = 0;
        break;
      }
      window.push(v);
    }
    if (window.length !== period) continue;
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const varr = window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    out[i] = Math.sqrt(varr);
  }
  return out;
}

export function computeIndicators(bars: Bar[]): IndicatorPack {
  const n = bars.length;
  const closes = bars.map((b) => b.close);
  const sma10 = sma(closes, 10);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma100 = sma(closes, 100);
  const sma200 = sma(closes, 200);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd: (number | null)[] = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (ema12[i] != null && ema26[i] != null) macd[i] = (ema12[i] as number) - (ema26[i] as number);
  }
  const macdSignal = emaSparse(macd, 9);
  const macdHist = macd.map((v, i) => (v != null && macdSignal[i] != null ? v - (macdSignal[i] as number) : null));
  const rsi14 = rsi(closes, 14);
  const stochK: (number | null)[] = Array(n).fill(null);
  for (let i = 13; i < n; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i - 13; j <= i; j++) {
      lo = Math.min(lo, bars[j].low);
      hi = Math.max(hi, bars[j].high);
    }
    stochK[i] = hi === lo ? 50 : ((closes[i] - lo) / (hi - lo)) * 100;
  }
  const stochD: (number | null)[] = Array(n).fill(null);
  for (let i = 2; i < n; i++) {
    const a = stochK[i];
    const b = stochK[i - 1];
    const c = stochK[i - 2];
    if (a == null || b == null || c == null) continue;
    stochD[i] = (a + b + c) / 3;
  }
  const roc12: (number | null)[] = Array(n).fill(null);
  const ret1: (number | null)[] = Array(n).fill(null);
  const ret5: (number | null)[] = Array(n).fill(null);
  const ret10: (number | null)[] = Array(n).fill(null);
  const logRet: (number | null)[] = Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (closes[i - 1] > 0) {
      ret1[i] = closes[i] / closes[i - 1] - 1;
      logRet[i] = Math.log(closes[i] / closes[i - 1]);
    }
    if (i >= 5 && closes[i - 5] > 0) ret5[i] = closes[i] / closes[i - 5] - 1;
    if (i >= 10 && closes[i - 10] > 0) ret10[i] = closes[i] / closes[i - 10] - 1;
    if (i >= 12 && closes[i - 12] > 0) roc12[i] = (closes[i] / closes[i - 12] - 1) * 100;
  }
  const bbMid = sma20;
  const bbUpper: (number | null)[] = Array(n).fill(null);
  const bbLower: (number | null)[] = Array(n).fill(null);
  const bbPct: (number | null)[] = Array(n).fill(null);
  for (let i = 19; i < n; i++) {
    let sum = 0;
    for (let j = i - 19; j <= i; j++) sum += closes[j];
    const mean = sum / 20;
    let varr = 0;
    for (let j = i - 19; j <= i; j++) varr += (closes[j] - mean) ** 2;
    const sd = Math.sqrt(varr / 20);
    const up = mean + 2 * sd;
    const lo = mean - 2 * sd;
    bbUpper[i] = up;
    bbLower[i] = lo;
    bbPct[i] = up === lo ? 0.5 : (closes[i] - lo) / (up - lo);
  }
  const atr14: (number | null)[] = Array(n).fill(null);
  const trs: number[] = [];
  for (let i = 1; i < n; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - closes[i - 1]),
      Math.abs(bars[i].low - closes[i - 1]),
    );
    trs.push(tr);
    if (i === 14) atr14[i] = trs.reduce((a, b) => a + b, 0) / 14;
    else if (i > 14 && atr14[i - 1] != null) atr14[i] = ((atr14[i - 1] as number) * 13 + tr) / 14;
  }
  const rollStd20 = rollingStd(logRet, 20);
  const volSma20 = sma(bars.map((b) => b.volume), 20);
  const obv: (number | null)[] = Array(n).fill(null);
  let obvRun = 0;
  obv[0] = 0;
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i - 1]) obvRun += bars[i].volume;
    else if (closes[i] < closes[i - 1]) obvRun -= bars[i].volume;
    obv[i] = obvRun;
  }
  const volChange: (number | null)[] = Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (bars[i - 1].volume > 0) volChange[i] = (bars[i].volume / bars[i - 1].volume - 1) * 100;
  }
  const hlPct = bars.map((b) => (b.close !== 0 ? ((b.high - b.low) / b.close) * 100 : null));
  const ocPct = bars.map((b) => (b.open !== 0 ? ((b.close - b.open) / b.open) * 100 : null));
  return {
    sma10, sma20, sma50, sma100, sma200, ema12, ema26, macd, macdSignal, macdHist,
    rsi14, stochK, stochD, roc12, bbMid, bbUpper, bbLower, bbPct, atr14, rollStd20,
    volSma20, obv, volChange, ret1, ret5, ret10, logRet, hlPct, ocPct,
  };
}

export const FEATURE_LABELS: Record<string, string> = {
  ret1: "1-day return",
  ret5: "5-day return",
  ret10: "10-day return",
  sma10: "Close vs SMA 10",
  sma20: "Close vs SMA 20",
  sma50: "Close vs SMA 50",
  ema12: "Close vs EMA 12",
  macd: "MACD / price",
  rsi: "RSI 14",
  stoch: "Stochastic %K",
  roc: "Rate of change 12",
  bb: "Bollinger %B",
  atr: "ATR / price",
  vol: "Volume vs average",
  hl: "High-low range",
  oc: "Open-close change",
};

const LONG_FEATURES = ["ret1", "ret5", "ret10", "sma10", "sma20", "sma50", "ema12", "macd", "rsi", "stoch", "roc", "bb", "atr", "vol", "hl", "oc"];
const SHORT_FEATURES = ["ret1", "ret5", "sma10", "sma20", "ema12", "macd", "rsi", "stoch", "bb", "atr", "vol", "hl", "oc"];

function ratio(close: number, ma: number | null) {
  if (ma == null || ma === 0 || !Number.isFinite(ma)) return null;
  return close / ma - 1;
}

export function featureVector(pack: IndicatorPack, bars: Bar[], index: number, names: string[]) {
  const close = bars[index]?.close;
  if (!close || !Number.isFinite(close)) return null;
  const raw: Record<string, number | null> = {
    ret1: pack.ret1[index],
    ret5: pack.ret5[index],
    ret10: pack.ret10[index],
    sma10: ratio(close, pack.sma10[index]),
    sma20: ratio(close, pack.sma20[index]),
    sma50: ratio(close, pack.sma50[index]),
    ema12: ratio(close, pack.ema12[index]),
    macd: pack.macd[index] == null ? null : (pack.macd[index] as number) / close,
    rsi: pack.rsi14[index] == null ? null : (pack.rsi14[index] as number) / 100,
    stoch: pack.stochK[index] == null ? null : (pack.stochK[index] as number) / 100,
    roc: pack.roc12[index] == null ? null : (pack.roc12[index] as number) / 100,
    bb: pack.bbPct[index],
    atr: pack.atr14[index] == null ? null : (pack.atr14[index] as number) / close,
    vol: pack.volSma20[index] && pack.volSma20[index]! > 0 ? bars[index].volume / (pack.volSma20[index] as number) - 1 : null,
    hl: pack.hlPct[index] == null ? null : (pack.hlPct[index] as number) / 100,
    oc: pack.ocPct[index] == null ? null : (pack.ocPct[index] as number) / 100,
  };
  const x: number[] = [];
  for (const name of names) {
    const v = raw[name];
    if (v == null || !Number.isFinite(v)) return null;
    x.push(v);
  }
  return x;
}

export function selectFeatureNames(bars: Bar[], horizon: number) {
  const pack = computeIndicators(bars);
  const count = (names: string[]) => {
    let n = 0;
    for (let i = 0; i < bars.length - horizon; i++) {
      if (featureVector(pack, bars, i, names)) n++;
    }
    return n;
  };
  if (count(LONG_FEATURES) >= 120) return { pack, names: LONG_FEATURES };
  return { pack, names: SHORT_FEATURES };
}

export function latestSnapshot(bars: Bar[], pack: IndicatorPack) {
  const i = bars.length - 1;
  const close = bars[i]?.close ?? null;
  const pick = (arr: (number | null)[]) => {
    for (let k = arr.length - 1; k >= 0; k--) if (arr[k] != null && Number.isFinite(arr[k] as number)) return arr[k];
    return null;
  };
  const windowReturn = bars.length > 1 && bars[0].close > 0 ? (bars[i].close / bars[0].close - 1) * 100 : null;
  const logRets = pack.logRet.filter((v): v is number => v != null && Number.isFinite(v));
  const slice = logRets.slice(-20);
  let vol20: number | null = null;
  if (slice.length >= 10) {
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const varr = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    vol20 = Math.sqrt(varr) * Math.sqrt(252) * 100;
  }
  return {
    close,
    date: bars[i]?.date ?? null,
    windowReturnPct: windowReturn,
    realizedVol20AnnPct: vol20,
    rsi14: pick(pack.rsi14),
    macd: pick(pack.macd),
    macdSignal: pick(pack.macdSignal),
    macdHist: pick(pack.macdHist),
    sma10: pick(pack.sma10),
    sma20: pick(pack.sma20),
    sma50: pick(pack.sma50),
    sma100: pick(pack.sma100),
    sma200: pick(pack.sma200),
    ema12: pick(pack.ema12),
    ema26: pick(pack.ema26),
    bbUpper: pick(pack.bbUpper),
    bbLower: pick(pack.bbLower),
    bbPct: pick(pack.bbPct),
    atr14: pick(pack.atr14),
    stochK: pick(pack.stochK),
    stochD: pick(pack.stochD),
    roc12: pick(pack.roc12),
    obv: pick(pack.obv),
    volSma20: pick(pack.volSma20),
    high: Math.max(...bars.map((b) => b.high)),
    low: Math.min(...bars.map((b) => b.low)),
    avgVolume: bars.reduce((a, b) => a + b.volume, 0) / bars.length,
  };
}

export function describeRsi(rsi: number | null) {
  if (rsi == null) return "Unavailable";
  if (rsi >= 70) return "Elevated. Traders often call this overbought. That is a description, not a signal.";
  if (rsi <= 30) return "Depressed. Traders often call this oversold. That is a description, not a signal.";
  return "Mid-range, between the usual 30 and 70 markers.";
}
