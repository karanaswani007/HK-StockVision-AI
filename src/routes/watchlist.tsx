import { ChangePill, Card, DelayedBadge, Disclaimer, ErrorNote, LoadingBlock, PageHeader } from "@/components/ui";
import { getQuotes } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useAppStore, useHydrated } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/watchlist")({
  head: () => ({ meta: [{ title: "Watchlist · HK StockVision AI" }] }),
  component: WatchlistPage,
});

function WatchlistPage() {
  const hydrated = useHydrated();
  const watchlist = useAppStore((state) => state.watchlist);
  const toggleWatch = useAppStore((state) => state.toggleWatch);
  const symbols = watchlist.map((item) => item.symbol);
  const quotes = useQuery({
    queryKey: ["quotes", symbols.join(",")],
    queryFn: () => getQuotes({ data: { symbols } }),
    enabled: hydrated && symbols.length > 0,
  });

  return (
    <div>
      <PageHeader kicker="Watchlist" title="Names you kept" description="Saved in this browser only. Quotes are delayed and refresh when you open the page." />
      <div className="mb-3">
        <DelayedBadge />
      </div>
      {!hydrated ? <LoadingBlock label="Restoring your list…" /> : null}
      {hydrated && watchlist.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No symbols yet. Open a stock in the explorer and press Watch.</p>
          <Link to="/explorer" search={{ symbol: "HDFCBANK.NS", range: "1y", interval: "1d" }} className="mt-3 inline-block text-sm text-accent">
            Start with HDFC Bank
          </Link>
        </Card>
      ) : null}
      {quotes.isLoading ? <LoadingBlock label="Fetching saved symbols…" /> : null}
      {quotes.data && !quotes.data.ok ? <ErrorNote message="Quotes could not be loaded." /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {hydrated
          ? watchlist.map((item) => {
              const quote = quotes.data?.ok ? quotes.data.quotes.find((row) => row.ok && row.symbol === item.symbol) : undefined;
              const failed = quotes.data?.ok ? quotes.data.quotes.find((row) => !row.ok && row.symbol === item.symbol) : undefined;
              return (
                <Card key={item.symbol}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted">{item.name}</p>
                      <p className="font-mono text-xs text-accent">{item.symbol}</p>
                      {quote && quote.ok ? <p className="mt-2 font-mono text-2xl">{formatMoney(quote.price, quote.currency)}</p> : null}
                      {failed && !failed.ok ? <p className="mt-2 text-sm text-down">{failed.error}</p> : null}
                    </div>
                    {quote && quote.ok ? <ChangePill value={quote.changePct} /> : null}
                  </div>
                  {quote && quote.ok ? <p className="mt-2 text-xs text-faint">{quote.asOf || quote.lastDate} · last close {formatMoney(quote.lastClose, quote.currency)}</p> : null}
                  <div className="mt-3 flex gap-2">
                    <Link to="/explorer" search={{ symbol: item.symbol, range: "1y", interval: "1d" }} className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm">
                      Open
                    </Link>
                    <button type="button" className="min-h-11 rounded-md px-3 text-sm text-muted hover:text-down" onClick={() => toggleWatch(item)}>
                      Remove
                    </button>
                  </div>
                </Card>
              );
            })
          : null}
      </div>
      <Disclaimer className="mt-4" />
    </div>
  );
}
