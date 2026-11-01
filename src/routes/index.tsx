import { ChangePill, Card, DelayedBadge, Disclaimer, ErrorNote, LoadingBlock, PageHeader, Segmented } from "@/components/ui";
import { getOverview } from "@/lib/api";
import { PRESETS } from "@/lib/market/constants";
import { formatMoney, formatPct } from "@/lib/format";
import { useAppStore, useHydrated } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Overview · HK StockVision AI" }] }),
  component: OverviewPage,
});

function OverviewPage() {
  const hydrated = useHydrated();
  const market = useAppStore((state) => state.market);
  const setMarket = useAppStore((state) => state.setMarket);
  const watchlist = useAppStore((state) => state.watchlist);
  const recent = useAppStore((state) => state.recent);
  const runs = useAppStore((state) => state.runs);
  const board = useQuery({ queryKey: ["overview"], queryFn: () => getOverview() });
  const [active, setActive] = useState("^NSEI");

  const indices = board.data?.ok ? board.data.indices : [];
  const visible = indices.filter((item) => market === "All" || item.market === market);
  const selected = indices.find((item) => item.ok && item.symbol === active && (market === "All" || item.market === market));
  const chart = selected && selected.ok ? selected : indices.find((item) => item.ok && (market === "All" || item.market === market));

  return (
    <div>
      <PageHeader
        kicker="Market board"
        title="Where the tape left off"
        description="Index levels from the latest delayed Yahoo Finance quotes. Nothing on this board is a live exchange feed."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Market filter"
          value={market}
          onChange={setMarket}
          options={[
            { id: "All", label: "All" },
            { id: "India", label: "India" },
            { id: "US", label: "United States" },
          ]}
        />
        <DelayedBadge />
      </div>
      {board.isLoading ? <LoadingBlock label="Fetching index history…" /> : null}
      {board.data && !board.data.ok ? <ErrorNote message={board.data.error} onRetry={() => void board.refetch()} /> : null}
      {board.isError ? <ErrorNote message="The market board could not be loaded." onRetry={() => void board.refetch()} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((item) =>
          item.ok ? (
            <button
              key={item.symbol}
              type="button"
              onClick={() => setActive(item.symbol)}
              className={`rounded-lg border bg-surface p-4 text-left ${active === item.symbol ? "border-accent" : "border-line"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">{item.name}</p>
                  <p className="mt-1 font-mono text-2xl">{formatMoney(item.price, item.currency)}</p>
                </div>
                <ChangePill value={item.changePct} />
              </div>
              <Spark values={item.spark} up={(item.changePct ?? 0) >= 0} />
              <p className="mt-2 text-xs text-faint">
                {item.market} · {item.asOf || "timestamp unavailable"}
              </p>
            </button>
          ) : (
            <Card key={item.symbol}>
              <p className="text-sm font-medium">{item.name}</p>
              <p className="mt-2 text-sm text-down">{item.error}</p>
            </Card>
          ),
        )}
      </div>
      {chart && chart.ok ? (
        <Card className="mt-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">{chart.name} · last month of closes</h2>
              <p className="text-xs text-faint">Daily closes already in the board request. Not a live chart.</p>
            </div>
            <Link to="/explorer" search={{ symbol: chart.symbol, range: "6mo", interval: "1d" }} className="text-sm text-accent">
              Open in explorer
            </Link>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.spark.map((close, index) => ({ index, close }))}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="index" hide />
                <YAxis orientation="right" domain={["auto", "auto"]} tick={{ fill: "var(--color-faint)", fontSize: 11 }} width={68} />
                <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, color: "var(--color-fg)" }} />
                <Line type="monotone" dataKey="close" stroke="var(--color-accent)" dot={false} strokeWidth={1.8} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="text-sm font-medium">Jump to a symbol</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Link key={preset.symbol} to="/explorer" search={{ symbol: preset.symbol, range: "1y", interval: "1d" }} className="min-h-11 rounded-md border border-line px-3 py-2 text-sm text-muted hover:text-fg">
                {preset.name}
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-sm font-medium">Watchlist</h2>
          {!hydrated || watchlist.length === 0 ? <p className="mt-3 text-sm text-muted">Star a stock in the explorer. It stays on this device.</p> : null}
          <ul className="mt-2">
            {hydrated
              ? watchlist.slice(0, 5).map((item) => (
                  <li key={item.symbol}>
                    <Link to="/explorer" search={{ symbol: item.symbol, range: "1y", interval: "1d" }} className="flex min-h-11 items-center justify-between text-sm">
                      <span>{item.name}</span>
                      <span className="font-mono text-xs text-muted">{item.symbol}</span>
                    </Link>
                  </li>
                ))
              : null}
          </ul>
        </Card>
        <Card>
          <h2 className="text-sm font-medium">Recently opened</h2>
          {!hydrated || recent.length === 0 ? <p className="mt-3 text-sm text-muted">Symbols you open will be listed here.</p> : null}
          <ul className="mt-2">
            {hydrated
              ? recent.map((item) => (
                  <li key={item.symbol}>
                    <Link to="/explorer" search={{ symbol: item.symbol, range: "1y", interval: "1d" }} className="flex min-h-11 items-center justify-between text-sm">
                      <span>{item.name}</span>
                      <span className="font-mono text-xs text-muted">{item.symbol}</span>
                    </Link>
                  </li>
                ))
              : null}
          </ul>
          {hydrated && runs[0] ? (
            <p className="mt-3 text-xs text-faint">
              Last forecast: {runs[0].symbol} · {runs[0].model} · {formatPct(runs[0].changePct)} over {runs[0].horizon} sessions
            </p>
          ) : null}
        </Card>
      </div>
      <Disclaimer className="mt-4" />
    </div>
  );
}

function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 120;
      const y = 36 - ((value - min) / span) * 32 - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 120 36" className="mt-3 h-9 w-full" aria-hidden>
      <path d={d} fill="none" stroke={up ? "var(--color-up)" : "var(--color-down)"} strokeWidth="1.6" />
    </svg>
  );
}
