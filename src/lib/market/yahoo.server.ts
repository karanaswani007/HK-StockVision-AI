import { formatDay, formatStamp } from "@/lib/format";
import { INDICES, isInterval, isRange, normalizeSymbol } from "@/lib/market/constants";
import type {
  Bar,
  CorporateAction,
  HistoryOk,
  OverviewFail,
  OverviewIndex,
  SearchHit,
  StockMeta,
} from "@/lib/types";

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const data = await load();
  const failed =
    typeof data === "object" &&
    data !== null &&
    "ok" in data &&
    (data as { ok: boolean }).ok === false;
  if (!failed) cache.set(key, { at: Date.now(), data });
  return data;
}

async function yahooJson(url: string) {
  let last = "Market data could not be reached.";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "HKStockVision/1.0 (educational analytics)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        last = "The data provider returned an error. Try again shortly.";
        continue;
      }
      return (await res.json()) as unknown;
    } catch {
      last = "The data provider timed out. Try again shortly.";
    }
  }
  throw new Error(last);
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function searchSymbols(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 1 || q.length > 40) return [];
  return cached(`search:${q.toLowerCase()}`, 5 * 60 * 1000, async () => {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`;
    const json = (await yahooJson(url)) as { quotes?: Record<string, unknown>[] } | null;
    const quotes = json?.quotes ?? [];
    const hits: SearchHit[] = [];
    for (const quote of quotes) {
      const symbol = normalizeSymbol(typeof quote.symbol === "string" ? quote.symbol : "");
      if (!symbol) continue;
      const type =
        typeof quote.quoteType === "string"
          ? quote.quoteType
          : typeof quote.typeDisp === "string"
            ? quote.typeDisp
            : "Security";
      if (type === "OPTION" || type === "FUTURE") continue;
      hits.push({
        symbol,
        name:
          (typeof quote.shortname === "string" && quote.shortname) ||
          (typeof quote.longname === "string" && quote.longname) ||
          symbol,
        exchange: typeof quote.exchDisp === "string" ? quote.exchDisp : "",
        type,
      });
    }
    return hits;
  });
}

type ChartPayload = {
  meta: StockMeta;
  bars: Bar[];
  actions: CorporateAction[];
  truncated: boolean;
};

function parseChart(
  symbol: string,
  json: unknown,
  range: string,
  interval: string,
): { ok: true; data: ChartPayload } | { ok: false; error: string } {
  const root = json as {
    chart?: {
      result?: {
        meta?: Record<string, unknown>;
        timestamp?: number[];
        indicators?: {
          quote?: Record<string, (number | null)[]>[];
          adjclose?: { adjclose?: (number | null)[] }[];
        };
        events?: {
          dividends?: Record<string, { amount?: number; date?: number }>;
          splits?: Record<
            string,
            { splitRatio?: string; date?: number; numerator?: number; denominator?: number }
          >;
        };
      }[];
      error?: { description?: string } | null;
    };
  };
  const err = root?.chart?.error?.description;
  const result = root?.chart?.result?.[0];
  if (!result) {
    return {
      ok: false,
      error:
        err || `No data found for ${symbol}. Check the ticker. Use .NS for NSE and .BO for BSE.`,
    };
  }
  const meta = result.meta ?? {};
  const ts = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const timeZone =
    typeof meta.exchangeTimezoneName === "string" ? meta.exchangeTimezoneName : "UTC";
  const bars: Bar[] = [];
  let adjusted = false;
  for (let i = 0; i < ts.length; i++) {
    const closeRaw = num(quote.close?.[i]);
    if (closeRaw == null || closeRaw <= 0) continue;
    const adjClose = num(adj[i]);
    const factor = adjClose != null && adjClose > 0 ? adjClose / closeRaw : 1;
    if (Math.abs(factor - 1) > 0.0005) adjusted = true;
    const openRaw = num(quote.open?.[i]) ?? closeRaw;
    const highRaw = num(quote.high?.[i]) ?? closeRaw;
    const lowRaw = num(quote.low?.[i]) ?? closeRaw;
    const close = closeRaw * factor;
    bars.push({
      date: formatDay(ts[i], timeZone),
      ts: ts[i],
      open: openRaw * factor,
      high: Math.max(highRaw, openRaw, closeRaw) * factor,
      low: Math.min(lowRaw, openRaw, closeRaw) * factor,
      close,
      volume: Math.max(0, num(quote.volume?.[i]) ?? 0),
    });
  }
  if (bars.length < 2) return { ok: false, error: `Not enough historical bars for ${symbol}.` };
  let truncated = false;
  let used = bars;
  if (used.length > 1500) {
    used = used.slice(used.length - 1500);
    truncated = true;
  }
  const last = used[used.length - 1];
  const prior = used[used.length - 2];
  const quoted = num(meta.regularMarketPrice);
  const pct = num(meta.regularMarketChangePercent);
  const quotedAt = num(meta.regularMarketTime);
  const previousClose =
    pct != null && quoted != null && pct > -99 ? quoted / (1 + pct / 100) : prior.close;
  const priceForChange = quoted ?? last.close;
  const change = priceForChange - previousClose;
  const changePct =
    pct != null ? pct : previousClose ? (priceForChange / previousClose - 1) * 100 : null;
  const actions: CorporateAction[] = [];
  for (const item of Object.values(result.events?.dividends ?? {})) {
    if (!item || item.date == null || item.amount == null) continue;
    actions.push({
      date: formatDay(item.date, timeZone),
      kind: "dividend",
      detail: `Dividend ${item.amount}`,
    });
  }
  for (const item of Object.values(result.events?.splits ?? {})) {
    if (!item || item.date == null) continue;
    const ratio =
      item.splitRatio ||
      (item.numerator && item.denominator ? `${item.numerator}:${item.denominator}` : "Split");
    actions.push({ date: formatDay(item.date, timeZone), kind: "split", detail: `Split ${ratio}` });
  }
  actions.sort((a, b) => a.date.localeCompare(b.date));
  const stock: StockMeta = {
    symbol: typeof meta.symbol === "string" ? meta.symbol : symbol,
    name:
      (typeof meta.longName === "string" && meta.longName) ||
      (typeof meta.shortName === "string" && meta.shortName) ||
      symbol,
    exchange: typeof meta.exchangeName === "string" ? meta.exchangeName : "",
    fullExchange: typeof meta.fullExchangeName === "string" ? meta.fullExchangeName : "",
    currency: typeof meta.currency === "string" ? meta.currency : "USD",
    timezone: timeZone,
    instrumentType: typeof meta.instrumentType === "string" ? meta.instrumentType : "security",
    lastClose: last.close,
    lastDate: last.date,
    previousClose,
    quotedPrice: quoted,
    quotedAt: quotedAt ? formatStamp(quotedAt, timeZone) : null,
    change,
    changePct,
    fiftyTwoWeekHigh: num(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(meta.fiftyTwoWeekLow),
    dayHigh: num(meta.regularMarketDayHigh),
    dayLow: num(meta.regularMarketDayLow),
    volume: num(meta.regularMarketVolume) ?? last.volume,
    adjusted,
    delayed: true,
    source: "Yahoo Finance",
  };
  void range;
  void interval;
  return { ok: true, data: { meta: stock, bars: used, actions, truncated } };
}

export async function loadChart(
  symbolInput: string,
  range: string,
  interval: string,
): Promise<HistoryOk | { ok: false; error: string }> {
  const symbol = normalizeSymbol(symbolInput);
  if (!symbol)
    return { ok: false, error: "Enter a valid ticker such as RELIANCE.NS, TCS.NS, or AAPL." };
  if (!isRange(range)) return { ok: false, error: "Choose a supported history length." };
  if (!isInterval(interval))
    return { ok: false, error: "Choose a daily, weekly, or monthly interval." };
  try {
    return await cached(`chart:${symbol}:${range}:${interval}`, 10 * 60 * 1000, async () => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&events=div%7Csplit&includeAdjustedClose=true`;
      const json = await yahooJson(url);
      if (!json) return { ok: false as const, error: `No data found for ${symbol}.` };
      const parsed = parseChart(symbol, json, range, interval);
      if (!parsed.ok) return parsed;
      const note = [
        parsed.data.meta.adjusted
          ? "Prices are split- and dividend-adjusted when Yahoo provides an adjusted close."
          : "Adjusted close was not available, so raw closes are shown.",
        parsed.data.truncated ? "Showing the latest 1,500 sessions." : "",
        "This is delayed historical data, not a live quote. The last daily close is the anchor for any forecast.",
      ]
        .filter(Boolean)
        .join(" ");
      return {
        ok: true as const,
        meta: parsed.data.meta,
        bars: parsed.data.bars,
        actions: parsed.data.actions,
        range,
        interval,
        note,
      };
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Market data is temporarily unavailable.",
    };
  }
}

export async function loadOverview(): Promise<
  | { ok: true; indices: (OverviewIndex | OverviewFail)[]; fetchedAt: string }
  | { ok: false; error: string }
> {
  try {
    const indices = await Promise.all(
      INDICES.map(async (index): Promise<OverviewIndex | OverviewFail> => {
        const chart = await loadChart(index.symbol, "1mo", "1d");
        if (!chart.ok)
          return {
            ok: false,
            symbol: index.symbol,
            name: index.name,
            market: index.market,
            error: chart.error,
          };
        const price = chart.meta.quotedPrice ?? chart.meta.lastClose;
        return {
          ok: true,
          symbol: chart.meta.symbol,
          name: index.name,
          market: index.market,
          currency: chart.meta.currency,
          price,
          previousClose: chart.meta.previousClose,
          change: chart.meta.change,
          changePct: chart.meta.changePct,
          asOf: chart.meta.quotedAt || chart.meta.lastDate,
          spark: chart.bars.slice(-24).map((b) => b.close),
        };
      }),
    );
    return { ok: true, indices, fetchedAt: new Date().toISOString() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Market overview is temporarily unavailable.",
    };
  }
}

export async function loadQuotes(symbols: string[]) {
  const unique = [...new Set(symbols.map((s) => normalizeSymbol(s)).filter(Boolean))].slice(0, 12);
  const rows = await Promise.all(
    unique.map(async (symbol) => {
      const chart = await loadChart(symbol, "1mo", "1d");
      if (!chart.ok) return { ok: false as const, symbol, error: chart.error };
      return {
        ok: true as const,
        symbol: chart.meta.symbol,
        name: chart.meta.name,
        currency: chart.meta.currency,
        price: chart.meta.quotedPrice ?? chart.meta.lastClose,
        changePct: chart.meta.changePct,
        asOf: chart.meta.quotedAt || chart.meta.lastDate,
        lastClose: chart.meta.lastClose,
        lastDate: chart.meta.lastDate,
      };
    }),
  );
  return { ok: true as const, quotes: rows };
}
