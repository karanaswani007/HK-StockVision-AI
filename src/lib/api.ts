import { answerQuestion, allowAiCall, buildContext, writeReport } from "@/lib/ai/analyst.server";
import { isHorizon, isModel, normalizeSymbol } from "@/lib/market/constants";
import { loadChart, loadOverview, loadQuotes, searchSymbols } from "@/lib/market/yahoo.server";
import { ALL_MODELS, hashSeed, runModel, verdictFor } from "@/lib/ml/engine";
import type { AiBundle, CompareOk, PredictionOk } from "@/lib/types";
import { createServerFn } from "@tanstack/react-start";

const reportCache = new Map<string, { at: number; value: AiBundle }>();

export const searchStocks = createServerFn({ method: "GET" })
  .validator((input: { q?: string }) => ({ q: (input?.q ?? "").toString().slice(0, 40) }))
  .handler(async ({ data }) => {
    try {
      const hits = await searchSymbols(data.q);
      return { ok: true as const, hits };
    } catch {
      return { ok: false as const, error: "Search is temporarily unavailable.", hits: [] as [] };
    }
  });

export const getHistory = createServerFn({ method: "GET" })
  .validator((input: { symbol?: string; range?: string; interval?: string }) => ({
    symbol: input?.symbol ?? "",
    range: input?.range ?? "1y",
    interval: input?.interval ?? "1d",
  }))
  .handler(async ({ data }) => loadChart(data.symbol, data.range, data.interval));

export const getOverview = createServerFn({ method: "GET" }).handler(async () => loadOverview());

export const getQuotes = createServerFn({ method: "POST" })
  .validator((input: { symbols?: string[] }) => ({
    symbols: Array.isArray(input?.symbols) ? input.symbols.slice(0, 12) : [],
  }))
  .handler(async ({ data }) => loadQuotes(data.symbols));

export const generatePrediction = createServerFn({ method: "POST" })
  .validator((input: { symbol?: string; range?: string; horizon?: number; model?: string }) => {
    const symbol = normalizeSymbol(input?.symbol);
    if (!symbol) throw new Error("Enter a valid ticker such as RELIANCE.NS or AAPL.");
    const horizon = Number(input?.horizon);
    return {
      symbol,
      range: input?.range ?? "1y",
      horizon: isHorizon(horizon) ? horizon : 5,
      model: input?.model && isModel(input.model) ? input.model : "linear",
    };
  })
  .handler(async ({ data }): Promise<PredictionOk | { ok: false; error: string }> => {
    const chart = await loadChart(data.symbol, data.range, "1d");
    if (!chart.ok) return chart;
    const result = runModel(chart.bars, data.horizon, data.model, hashSeed(`${chart.meta.symbol}:${data.range}:${data.horizon}:${data.model}`));
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, kind: "one", meta: chart.meta, range: data.range, result };
  });

export const compareModels = createServerFn({ method: "POST" })
  .validator((input: { symbol?: string; range?: string; horizon?: number }) => {
    const symbol = normalizeSymbol(input?.symbol);
    if (!symbol) throw new Error("Enter a valid ticker such as INFY.NS or MSFT.");
    const horizon = Number(input?.horizon);
    return { symbol, range: input?.range ?? "1y", horizon: isHorizon(horizon) ? horizon : 5 };
  })
  .handler(async ({ data }): Promise<CompareOk | { ok: false; error: string }> => {
    const chart = await loadChart(data.symbol, data.range, "1d");
    if (!chart.ok) return chart;
    const results = ALL_MODELS.map((id) =>
      runModel(chart.bars, data.horizon, id, hashSeed(`${chart.meta.symbol}:${data.range}:${data.horizon}:${id}`)),
    );
    const verdict = verdictFor(results);
    return {
      ok: true,
      kind: "compare",
      meta: chart.meta,
      range: data.range,
      horizon: data.horizon,
      results,
      verdict: verdict.verdict,
      winnerId: verdict.winnerId,
    };
  });

export const analyzeStock = createServerFn({ method: "POST" })
  .validator((input: { symbol?: string; range?: string; horizon?: number }) => {
    const symbol = normalizeSymbol(input?.symbol);
    if (!symbol) throw new Error("Enter a ticker to analyze.");
    const horizon = Number(input?.horizon);
    return { symbol, range: input?.range ?? "1y", horizon: isHorizon(horizon) ? horizon : 5 };
  })
  .handler(async ({ data }) => {
    if (!allowAiCall()) return { ok: false as const, error: "Too many AI requests just now. Wait a minute and try again." };
    const chart = await loadChart(data.symbol, data.range, "1d");
    if (!chart.ok) return chart;
    const cacheKey = `${chart.meta.symbol}|${data.range}|${data.horizon}|${chart.meta.lastDate}|${chart.meta.lastClose.toFixed(4)}`;
    const cached = reportCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) return { ...cached.value, cached: true };
    const bundle = buildContext(chart.meta, chart.bars, data.range, data.horizon);
    const written = await writeReport(bundle);
    if (!written.ok) {
      return { ok: false as const, error: written.error, meta: chart.meta, context: bundle.context };
    }
    const value: AiBundle = {
      ok: true,
      meta: chart.meta,
      range: data.range,
      horizon: data.horizon,
      context: bundle.context,
      report: written.report,
      cached: false,
    };
    reportCache.set(cacheKey, { at: Date.now(), value });
    return value;
  });

export const chatStock = createServerFn({ method: "POST" })
  .validator((input: { symbol?: string; range?: string; horizon?: number; question?: string; history?: { role: "user" | "assistant"; content: string }[] }) => {
    const symbol = normalizeSymbol(input?.symbol);
    const question = (input?.question ?? "").trim();
    if (!symbol) throw new Error("Choose a stock before asking.");
    if (question.length < 2) throw new Error("Ask a question about this stock.");
    if (question.length > 800) throw new Error("Keep the question under 800 characters.");
    const horizon = Number(input?.horizon);
    const history = Array.isArray(input?.history)
      ? input.history
          .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
          .slice(-6)
      : [];
    return { symbol, range: input?.range ?? "1y", horizon: isHorizon(horizon) ? horizon : 5, question, history };
  })
  .handler(async ({ data }) => {
    if (!allowAiCall(14)) return { ok: false as const, error: "Too many AI requests just now. Wait a minute and try again." };
    const chart = await loadChart(data.symbol, data.range, "1d");
    if (!chart.ok) return chart;
    const bundle = buildContext(chart.meta, chart.bars, data.range, data.horizon);
    const answer = await answerQuestion(bundle, data.question, data.history);
    if (!answer.ok) return answer;
    return { ok: true as const, text: answer.text, meta: chart.meta };
  });
