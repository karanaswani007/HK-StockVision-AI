export type Bar = {
  date: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type CorporateAction = {
  date: string;
  kind: "dividend" | "split";
  detail: string;
};

export type StockMeta = {
  symbol: string;
  name: string;
  exchange: string;
  fullExchange: string;
  currency: string;
  timezone: string;
  instrumentType: string;
  lastClose: number;
  lastDate: string;
  previousClose: number | null;
  quotedPrice: number | null;
  quotedAt: string | null;
  change: number | null;
  changePct: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  adjusted: boolean;
  delayed: true;
  source: "Yahoo Finance";
};

export type HistoryOk = {
  ok: true;
  meta: StockMeta;
  bars: Bar[];
  actions: CorporateAction[];
  range: string;
  interval: string;
  note: string;
};

export type Fail = { ok: false; error: string };

export type SearchHit = {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
};

export type OverviewIndex = {
  ok: true;
  symbol: string;
  name: string;
  market: string;
  currency: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  asOf: string | null;
  spark: number[];
};

export type OverviewFail = { ok: false; symbol: string; name: string; market: string; error: string };

export type Metrics = {
  mae: number;
  mse: number;
  rmse: number;
  mape: number | null;
  r2: number | null;
  directionalAccuracy: number | null;
};

export type ModelId = "linear" | "forest" | "xgboost" | "lstm" | "gru";

export type ForecastPoint = {
  date: string;
  price: number;
  low: number;
  high: number;
};

export type ModelRun = {
  ok: true;
  id: ModelId;
  name: string;
  note: string;
  anchoredClose: number;
  anchorDate: string;
  horizon: number;
  directPrice: number;
  directChangePct: number;
  directLow: number;
  directHigh: number;
  rolloutPrice: number;
  rolloutChangePct: number;
  path: ForecastPoint[];
  disagreementPct: number;
  oneStep: Metrics;
  horizonMetrics: Metrics;
  baselineOneStep: Metrics;
  baselineHorizon: Metrics;
  walkForwardRmse: number | null;
  beatsBaseline: boolean;
  trainSize: number;
  testSize: number;
  trainMs: number;
  testSeries: { date: string; actual: number; predicted: number }[];
  importance: { name: string; value: number }[];
  intervalNote: string;
  strategyNote: string;
  warnings: string[];
};

export type ModelFailure = { ok: false; id: ModelId; name: string; error: string };
export type ModelOutput = ModelRun | ModelFailure;

export type PredictionOk = {
  ok: true;
  kind: "one";
  meta: StockMeta;
  range: string;
  result: ModelRun;
};

export type CompareOk = {
  ok: true;
  kind: "compare";
  meta: StockMeta;
  range: string;
  horizon: number;
  results: ModelOutput[];
  verdict: string;
  winnerId: ModelId | null;
};

export type AnalysisReport = {
  executiveSummary: string;
  historicalPerformance: string;
  technicalInterpretation: string;
  modelComparison: string;
  forecastInterpretation: string;
  bullishFactors: string[];
  bearishFactors: string[];
  risks: string[];
  overall: string;
  disclaimer: string;
};

export type AiBundle = {
  ok: true;
  meta: StockMeta;
  range: string;
  horizon: number;
  context: Record<string, unknown>;
  report: AnalysisReport;
  cached: boolean;
};
