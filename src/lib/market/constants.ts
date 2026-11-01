import type { ModelId } from "@/lib/types";

export const RANGES = [
  { id: "1mo", label: "1M" },
  { id: "3mo", label: "3M" },
  { id: "6mo", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "2y", label: "2Y" },
  { id: "5y", label: "5Y" },
  { id: "max", label: "Max" },
] as const;

export const INTERVALS = [
  { id: "1d", label: "Day" },
  { id: "1wk", label: "Week" },
  { id: "1mo", label: "Month" },
] as const;

export const HORIZONS = [
  { id: 1, label: "Next trading day" },
  { id: 5, label: "5 trading days" },
  { id: 10, label: "10 trading days" },
  { id: 20, label: "20 trading days" },
] as const;

export const MODELS: { id: ModelId; label: string; short: string }[] = [
  { id: "linear", label: "Linear Regression", short: "Linear" },
  { id: "forest", label: "Random Forest", short: "Forest" },
  { id: "xgboost", label: "Gradient Boosting", short: "Boosting" },
  { id: "lstm", label: "LSTM", short: "LSTM" },
  { id: "gru", label: "GRU", short: "GRU" },
];

export const INDICES = [
  { symbol: "^NSEI", name: "NIFTY 50", market: "India" },
  { symbol: "^BSESN", name: "SENSEX", market: "India" },
  { symbol: "^NSEBANK", name: "NIFTY BANK", market: "India" },
  { symbol: "^GSPC", name: "S&P 500", market: "US" },
  { symbol: "^IXIC", name: "NASDAQ", market: "US" },
  { symbol: "^DJI", name: "Dow Jones", market: "US" },
] as const;

export const PRESETS = [
  { symbol: "RELIANCE.NS", name: "Reliance" },
  { symbol: "TCS.NS", name: "TCS" },
  { symbol: "INFY.NS", name: "Infosys" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank" },
  { symbol: "SBIN.NS", name: "SBI" },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors" },
  { symbol: "ITC.NS", name: "ITC" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "META", name: "Meta" },
];

export type RangeId = (typeof RANGES)[number]["id"];
export type IntervalId = (typeof INTERVALS)[number]["id"];

export function isRange(value: string): value is RangeId {
  return RANGES.some((r) => r.id === value);
}

export function isInterval(value: string): value is IntervalId {
  return INTERVALS.some((r) => r.id === value);
}

export function isModel(value: string): value is ModelId {
  return MODELS.some((m) => m.id === value);
}

export function isHorizon(value: number): boolean {
  return value === 1 || value === 5 || value === 10 || value === 20;
}

export function normalizeSymbol(input: string | undefined | null) {
  if (!input) return "";
  const symbol = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^\^?[A-Z0-9][A-Z0-9.\-=]{0,18}$/.test(symbol)) return "";
  return symbol;
}

export const DISCLAIMER =
  "Educational analytics only. Forecasts are model estimates from past prices, not facts and not a recommendation to buy or sell. Nothing here is a promise of returns. Prices come from delayed Yahoo Finance history, not a live exchange feed. A lower historical error does not mean a model will work next.";
