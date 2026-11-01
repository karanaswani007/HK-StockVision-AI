import { computeIndicators, describeRsi, latestSnapshot } from "@/lib/market/indicators";
import { ALL_MODELS, hashSeed, runModel } from "@/lib/ml/engine";
import type { AnalysisReport, Bar, ModelRun, StockMeta } from "@/lib/types";
import { DISCLAIMER } from "@/lib/market/constants";

type Bundle = {
  meta: StockMeta;
  range: string;
  horizon: number;
  context: Record<string, unknown>;
  runs: ModelRun[];
};

const memory = new Map<string, { at: number; bundle: Bundle }>();

function roundN(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

export function buildContext(meta: StockMeta, bars: Bar[], range: string, horizon: number): Bundle {
  const key = `${meta.symbol}|${range}|${horizon}|${meta.lastDate}|${meta.lastClose.toFixed(4)}`;
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.bundle;
  const pack = computeIndicators(bars);
  const snap = latestSnapshot(bars, pack);
  const runs: ModelRun[] = [];
  for (const id of ALL_MODELS) {
    try {
      const result = runModel(
        bars,
        horizon,
        id,
        hashSeed(`${meta.symbol}:${range}:${horizon}:${id}`),
      );
      if (result.ok) runs.push(result);
    } catch (error) {
      console.error("model", id, error);
    }
  }
  const context = {
    symbol: meta.symbol,
    name: meta.name,
    exchange: meta.fullExchange || meta.exchange,
    currency: meta.currency,
    delayedQuote: {
      price: roundN(meta.quotedPrice, 4),
      asOf: meta.quotedAt,
      changePct: roundN(meta.changePct, 3),
    },
    lastDailyClose: { price: roundN(meta.lastClose, 4), date: meta.lastDate },
    previousClose: roundN(meta.previousClose, 4),
    window: {
      range,
      sessions: bars.length,
      start: bars[0]?.date ?? null,
      end: bars[bars.length - 1]?.date ?? null,
      returnPct: roundN(snap.windowReturnPct, 2),
      high: roundN(snap.high, 4),
      low: roundN(snap.low, 4),
      realizedVol20DayAnnualizedPct: roundN(snap.realizedVol20AnnPct, 2),
    },
    indicators: {
      rsi14: roundN(snap.rsi14, 2),
      rsiNote: describeRsi(snap.rsi14),
      macd: roundN(snap.macd, 4),
      macdSignal: roundN(snap.macdSignal, 4),
      macdHistogram: roundN(snap.macdHist, 4),
      sma20: roundN(snap.sma20, 4),
      sma50: roundN(snap.sma50, 4),
      sma200: roundN(snap.sma200, 4),
      bollingerPercentB: roundN(snap.bbPct, 3),
      atr14: roundN(snap.atr14, 4),
      stochasticK: roundN(snap.stochK, 2),
    },
    fiftyTwoWeek: { high: meta.fiftyTwoWeekHigh, low: meta.fiftyTwoWeekLow },
    models: runs.map((run) => ({
      name: run.name,
      horizonTradingDays: run.horizon,
      directForecastPrice: run.directPrice,
      directChangePct: run.directChangePct,
      rolloutPrice: run.rolloutPrice,
      interval: { low: run.directLow, high: run.directHigh },
      nextDayTest: run.oneStep,
      horizonTest: run.horizonMetrics,
      persistenceNextDayRmse: run.baselineOneStep.rmse,
      beatsPersistenceOnNextDayRmse: run.beatsBaseline,
      testSessions: run.testSize,
      trainSessions: run.trainSize,
    })),
    rules: [
      "Use only these figures.",
      "If a field is null, say the figure is unavailable.",
      "Do not invent prices, dates, or metrics.",
      "Separate historical fact, model estimate, and your commentary.",
      "Do not recommend buying or selling and do not promise returns.",
    ],
  };
  const bundle = { meta, range, horizon, context, runs };
  memory.set(key, { at: Date.now(), bundle });
  return bundle;
}

const SYSTEM = `You are the staff analyst inside HK StockVision AI, a product of HK SoftTech.
You explain a stock using only the JSON context the user message contains.
Never invent a price, date, indicator, or model score. If a value is null or missing, say it is unavailable.
Keep three layers distinct: historical fact, model estimate, and your commentary.
Do not give buy, sell, or hold instructions. Do not say returns are likely or guaranteed.
Write in clear prose. Be specific and calm. No hype, no emoji.`;

async function gemini(
  messages: { role: string; content: string }[],
  maxTokens: number,
  json: boolean,
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return {
      ok: false as const,
      error:
        "AI commentary is not configured. Set GEMINI_API_KEY to enable it. Computed figures are still valid.",
    };
  const systemInstruction = messages.find((message) => message.role === "system")?.content;
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingLevel: "low" },
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(40000),
      },
    );
    if (!res.ok) {
      if (res.status === 429)
        return {
          ok: false as const,
          error: "The Gemini API is at its quota. Wait a little and try again.",
        };
      if (res.status === 400) {
        return {
          ok: false as const,
          error: "The Gemini API rejected the request. Check the model and generation settings.",
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false as const,
          error: "Gemini rejected the API key or the key lacks permission for this model.",
        };
      }
      if (res.status === 404) {
        return {
          ok: false as const,
          error: "The configured Gemini model is unavailable to this API key.",
        };
      }
      if (res.status === 503) {
        console.error("[gemini] API is temporarily overloaded (HTTP 503)");
        return {
          ok: false as const,
          error: "Gemini is temporarily overloaded. Wait a moment and try again.",
        };
      }
      console.error(`[gemini] API returned HTTP ${res.status}`);
      return {
        ok: false as const,
        error: `The Gemini API is temporarily unavailable (HTTP ${res.status}). Try again.`,
      };
    }
    const payload = (await res.json()) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
      }[];
    };
    const candidate = payload.candidates?.[0];
    if (candidate?.finishReason === "MAX_TOKENS") {
      console.error(`[gemini] API response exceeded the ${maxTokens}-token output limit`);
      return {
        ok: false as const,
        error: "Gemini's response was incomplete. Try again; the report limit has been increased.",
      };
    }
    const text =
      candidate?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";
    if (!text) {
      const reason = payload.candidates?.[0]?.content
        ? "no text was generated"
        : "the response was blocked or empty";
      console.error(`[gemini] API returned no text: ${reason}`);
      return {
        ok: false as const,
        error: `Gemini returned no text (${reason}). Try again or check the prompt and model access.`,
      };
    }
    return { ok: true as const, text };
  } catch (error) {
    console.error("[gemini] API request failed:", error);
    return {
      ok: false as const,
      error:
        error instanceof Error && error.name === "TimeoutError"
          ? "Gemini timed out before responding. Try again."
          : "The Gemini API could not be reached. Check the server's network connection and try again.",
    };
  }
}

function textOf(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "Unavailable from the supplied figures.";
}

function listOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 6);
}

export function parseReport(raw: string): AnalysisReport | null {
  let parsed: unknown;
  const fenced = raw.match(/\{[\s\S]*\}/);
  try {
    parsed = JSON.parse(fenced ? fenced[0] : raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const data = parsed as Record<string, unknown>;
  const requiredTextFields = [
    "executiveSummary",
    "historicalPerformance",
    "technicalInterpretation",
    "modelComparison",
    "forecastInterpretation",
    "overall",
  ];
  if (requiredTextFields.some((field) => typeof data[field] !== "string" || !data[field].trim())) {
    return null;
  }
  return {
    executiveSummary: textOf(data.executiveSummary),
    historicalPerformance: textOf(data.historicalPerformance),
    technicalInterpretation: textOf(data.technicalInterpretation),
    modelComparison: textOf(data.modelComparison),
    forecastInterpretation: textOf(data.forecastInterpretation),
    bullishFactors: listOf(data.bullishFactors),
    bearishFactors: listOf(data.bearishFactors),
    risks: listOf(data.risks),
    overall: textOf(data.overall),
    disclaimer: DISCLAIMER,
  };
}

const hits: number[] = [];
export function allowAiCall(limit = 10) {
  const now = Date.now();
  while (hits.length && hits[0] < now - 60_000) hits.shift();
  if (hits.length >= limit) return false;
  hits.push(now);
  return true;
}

export async function writeReport(bundle: Bundle) {
  const messages = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Write a stock brief as JSON with keys executiveSummary, historicalPerformance, technicalInterpretation, modelComparison, forecastInterpretation, bullishFactors (array), bearishFactors (array), risks (array), overall. Context:\n${JSON.stringify(bundle.context)}`,
    },
  ];
  const result = await gemini(messages, 4096, true);
  if (!result.ok) return result;
  const report = parseReport(result.text);
  if (!report) {
    console.error("[gemini] API returned an incomplete or invalid JSON report");
    return {
      ok: false as const,
      error: "Gemini returned an incomplete report. Please try again.",
    };
  }
  return { ok: true as const, report };
}

export async function answerQuestion(
  bundle: Bundle,
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
) {
  const trimmed = history.slice(-6).map((item) => ({
    role: item.role,
    content: item.content.slice(0, 1500),
  }));
  const messages = [
    {
      role: "system",
      content: `${SYSTEM}\nAnswer the question in under 180 words. If the context cannot support an answer, say so.`,
    },
    {
      role: "user",
      content: `Context JSON:\n${JSON.stringify(bundle.context)}`,
    },
    ...trimmed,
    { role: "user", content: question.slice(0, 800) },
  ];
  return gemini(messages, 500, false);
}
