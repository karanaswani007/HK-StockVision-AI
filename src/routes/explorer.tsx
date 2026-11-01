import { PriceChart } from "@/components/price-chart";
import { Button, Card, ChangePill, DelayedBadge, Disclaimer, ErrorNote, LoadingBlock, PageHeader, Segmented } from "@/components/ui";
import { getHistory } from "@/lib/api";
import { formatCompact, formatMoney, formatNumber, formatPct } from "@/lib/format";
import { computeIndicators, describeRsi, latestSnapshot } from "@/lib/market/indicators";
import { INTERVALS, RANGES, isInterval, isRange, normalizeSymbol } from "@/lib/market/constants";
import { useAppStore } from "@/lib/store";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/explorer")({
  validateSearch: (search: Record<string, unknown>) => ({
    symbol: normalizeSymbol(typeof search.symbol === "string" ? search.symbol : "") || "RELIANCE.NS",
    range: typeof search.range === "string" && isRange(search.range) ? search.range : "1y",
    interval: typeof search.interval === "string" && isInterval(search.interval) ? search.interval : "1d",
  }),
  head: () => ({ meta: [{ title: "Explorer · HK StockVision AI" }] }),
  component: ExplorerPage,
});

function ExplorerPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const addRecent = useAppStore((state) => state.addRecent);
  const watchlist = useAppStore((state) => state.watchlist);
  const toggleWatch = useAppStore((state) => state.toggleWatch);
  const [tab, setTab] = useState<"overview" | "history" | "technicals">("overview");
  const [page, setPage] = useState(0);
  const [sma20, setSma20] = useState(true);
  const [sma50, setSma50] = useState(true);
  const [bb, setBb] = useState(false);
  const history = useQuery({
    queryKey: ["history", search.symbol, search.range, search.interval],
    queryFn: () => getHistory({ data: search }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (history.data?.ok) addRecent({ symbol: history.data.meta.symbol, name: history.data.meta.name });
  }, [history.data, addRecent]);

  useEffect(() => setPage(0), [search.symbol, search.range, search.interval]);

  const pack = useMemo(() => (history.data?.ok ? computeIndicators(history.data.bars) : null), [history.data]);
  const snap = history.data?.ok && pack ? latestSnapshot(history.data.bars, pack) : null;
  const saved = history.data?.ok ? watchlist.some((item) => item.symbol === history.data?.meta.symbol) : false;

  function setRange(range: string) {
    void navigate({ to: "/explorer", search: { ...search, range } });
  }
  function setInterval(interval: string) {
    void navigate({ to: "/explorer", search: { ...search, interval } });
  }

  const data = history.data;
  const rows = data?.ok ? [...data.bars].reverse() : [];
  const pageRows = rows.slice(page * 18, page * 18 + 18);

  return (
    <div>
      <PageHeader kicker="Stock explorer" title={data?.ok ? data.meta.name : search.symbol} description="Adjusted history when Yahoo provides it. Forecasts elsewhere are anchored to the last daily close, not an intraday print." />
      {history.isLoading ? <LoadingBlock label="Loading price history…" /> : null}
      {history.isError ? <ErrorNote message="History could not be loaded." onRetry={() => void history.refetch()} /> : null}
      {data && !data.ok ? <ErrorNote message={data.error} onRetry={() => void history.refetch()} /> : null}
      {data?.ok && pack && snap ? (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-accent">{data.meta.symbol}</span>
                  <span className="text-sm text-muted">{data.meta.fullExchange || data.meta.exchange}</span>
                  <DelayedBadge />
                </div>
                <p className="mt-2 font-mono text-3xl">{formatMoney(data.meta.quotedPrice ?? data.meta.lastClose, data.meta.currency)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ChangePill value={data.meta.changePct} />
                  <span className="text-xs text-muted">{data.meta.quotedAt ? `Quote time ${data.meta.quotedAt}` : `Last close ${data.meta.lastDate}`}</span>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Last daily close {formatMoney(data.meta.lastClose, data.meta.currency)} on {data.meta.lastDate}
                  {data.meta.previousClose != null ? ` · prior ${formatMoney(data.meta.previousClose, data.meta.currency)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={saved ? "primary" : "surface"}
                  onClick={() => {
                    toggleWatch({ symbol: data.meta.symbol, name: data.meta.name });
                    toast(saved ? "Removed from watchlist" : "Saved to watchlist");
                  }}
                >
                  <Star className="size-4" />
                  {saved ? "Watching" : "Watch"}
                </Button>
                <Link to="/predictions" search={{ symbol: data.meta.symbol, range: search.range === "1mo" || search.range === "3mo" ? "1y" : search.range, horizon: 5, model: "linear" }} className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm">
                  Forecast
                </Link>
                <Link to="/analyst" search={{ symbol: data.meta.symbol, range: "1y", horizon: 5 }} className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm">
                  Ask AI
                </Link>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Mini label="Window return" value={snap.windowReturnPct == null ? "—" : formatPct(snap.windowReturnPct)} />
              <Mini label="20-day vol, annualized" value={snap.realizedVol20AnnPct == null ? "—" : formatPct(snap.realizedVol20AnnPct)} />
              <Mini label="52-week high" value={data.meta.fiftyTwoWeekHigh == null ? "—" : formatMoney(data.meta.fiftyTwoWeekHigh, data.meta.currency)} />
              <Mini label="52-week low" value={data.meta.fiftyTwoWeekLow == null ? "—" : formatMoney(data.meta.fiftyTwoWeekLow, data.meta.currency)} />
            </div>
            {data.meta.fiftyTwoWeekHigh != null && data.meta.fiftyTwoWeekLow != null ? (
              <RangeBar low={data.meta.fiftyTwoWeekLow} high={data.meta.fiftyTwoWeekHigh} price={data.meta.quotedPrice ?? data.meta.lastClose} />
            ) : null}
          </Card>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["overview", "Overview"],
                ["history", "History"],
                ["technicals", "Technicals"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={tab === id} className={tab === id ? "tint-accent min-h-11 rounded-md px-3 text-sm" : "min-h-11 rounded-md px-3 text-sm text-muted"} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {tab === "overview" ? (
            <Card>
              <div className="mb-4 flex flex-col gap-3">
                <Segmented label="History length" value={search.range} onChange={setRange} options={RANGES.map((item) => ({ id: item.id, label: item.label }))} />
                <Segmented label="Interval" value={search.interval} onChange={setInterval} options={INTERVALS.map((item) => ({ id: item.id, label: item.label }))} />
                <div className="flex flex-wrap gap-2">
                  <Toggle on={sma20} label="SMA 20" set={setSma20} />
                  <Toggle on={sma50} label="SMA 50" set={setSma50} />
                  <Toggle on={bb} label="Bollinger" set={setBb} />
                </div>
              </div>
              <PriceChart bars={data.bars} pack={pack} showSma20={sma20} showSma50={sma50} showBb={bb} />
              <p className="mt-3 text-xs leading-relaxed text-faint">{data.note}</p>
            </Card>
          ) : null}
          {tab === "history" ? (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="text-xs text-faint">
                    <tr>
                      {["Date", "Open", "High", "Low", "Close", "Volume"].map((label) => (
                        <th key={label} className="py-2 font-medium">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((bar) => (
                      <tr key={bar.date + bar.ts} className="border-t border-line">
                        <td className="py-2 font-mono">{bar.date}</td>
                        <td className="py-2 font-mono">{formatNumber(bar.open)}</td>
                        <td className="py-2 font-mono">{formatNumber(bar.high)}</td>
                        <td className="py-2 font-mono">{formatNumber(bar.low)}</td>
                        <td className="py-2 font-mono">{formatNumber(bar.close)}</td>
                        <td className="py-2 font-mono">{formatCompact(bar.volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <Button variant="surface" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button>
                <span className="text-muted">{page + 1} / {Math.max(1, Math.ceil(rows.length / 18))}</span>
                <Button variant="surface" disabled={(page + 1) * 18 >= rows.length} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
              <h3 className="mt-5 text-sm font-medium">Dividends and splits in this window</h3>
              {data.actions.length === 0 ? <p className="mt-2 text-sm text-muted">None were returned for this range.</p> : null}
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {data.actions.slice(-12).map((action) => (
                  <li key={action.kind + action.date + action.detail}>
                    {action.date} · {action.detail}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {tab === "technicals" ? <Technicals bars={data.bars} pack={pack} snap={snap} currency={data.meta.currency} /> : null}
          <Disclaimer />
        </div>
      ) : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 font-mono text-sm">{value}</p>
    </div>
  );
}

function Toggle({ on, label, set }: { on: boolean; label: string; set: (value: boolean) => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => set(!on)} className={on ? "tint-accent min-h-11 rounded-md px-3 text-sm" : "min-h-11 rounded-md border border-line px-3 text-sm text-muted"}>
      {label}
    </button>
  );
}

function RangeBar({ low, high, price }: { low: number; high: number; price: number }) {
  const pct = high > low ? Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100)) : 50;
  return (
    <div className="mt-4">
      <div className="relative h-1.5 rounded-full bg-surface-2">
        <div className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-accent" style={{ left: `calc(${pct}% - 6px)` }} />
      </div>
      <p className="mt-2 text-xs text-faint">Position inside the 52-week high and low. The dot is the latest available price.</p>
    </div>
  );
}

function Technicals({
  bars,
  pack,
  snap,
  currency,
}: {
  bars: { date: string; close: number }[];
  pack: ReturnType<typeof computeIndicators>;
  snap: ReturnType<typeof latestSnapshot>;
  currency: string;
}) {
  const data = bars.map((bar, index) => ({
    date: bar.date,
    close: bar.close,
    rsi: pack.rsi14[index],
    macd: pack.macd[index],
    signal: pack.macdSignal[index],
    hist: pack.macdHist[index],
    upper: pack.bbUpper[index],
    lower: pack.bbLower[index],
  }));
  const rows = [
    ["RSI 14", snap.rsi14, describeRsi(snap.rsi14)],
    ["MACD", snap.macd, "Difference of the 12- and 26-period EMAs."],
    ["MACD signal", snap.macdSignal, "9-period EMA of MACD."],
    ["Stochastic %K", snap.stochK, "Where the close sits in the 14-session high-low range."],
    ["ROC 12", snap.roc12, "Percent change versus 12 sessions ago."],
    ["ATR 14", snap.atr14, "Average true range. A volatility gauge, not a direction."],
    ["Bollinger %B", snap.bbPct, "0 is the lower band, 1 is the upper band."],
    ["SMA 20", snap.sma20, ""],
    ["SMA 50", snap.sma50, ""],
    ["SMA 200", snap.sma200, snap.sma200 == null ? "Unavailable on this window." : ""],
    ["OBV", snap.obv, "On-balance volume running total."],
  ] as const;
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 text-sm font-medium">RSI 14</h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="date" minTickGap={32} tick={{ fill: "var(--color-faint)", fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: "var(--color-faint)", fontSize: 11 }} width={36} />
              <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, color: "var(--color-fg)" }} />
              <ReferenceLine y={70} stroke="var(--color-down)" strokeDasharray="3 3" />
              <ReferenceLine y={30} stroke="var(--color-up)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="rsi" stroke="var(--color-accent)" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <h3 className="mb-2 text-sm font-medium">MACD</h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="date" minTickGap={32} tick={{ fill: "var(--color-faint)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--color-faint)", fontSize: 11 }} width={48} />
              <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, color: "var(--color-fg)" }} />
              <Bar dataKey="hist" fill="var(--color-line)" isAnimationActive={false} />
              <Line type="monotone" dataKey="macd" stroke="var(--color-accent)" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="signal" stroke="var(--color-warn)" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <h3 className="mb-3 text-sm font-medium">Latest readings</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <tbody>
              {rows.map(([label, value, note]) => (
                <tr key={label} className="border-t border-line">
                  <td className="py-2 text-muted">{label}</td>
                  <td className="py-2 font-mono">{value == null ? "—" : typeof value === "number" && Math.abs(value) > 1000 && label !== "RSI 14" && label !== "Stochastic %K" && label !== "ROC 12" ? formatMoney(value, currency) : formatNumber(value as number, label === "Bollinger %B" ? 2 : 2)}</td>
                  <td className="py-2 text-faint">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
