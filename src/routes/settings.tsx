import { Button, Card, Disclaimer, PageHeader, Segmented } from "@/components/ui";
import { useAppStore } from "@/lib/store";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · HK StockVision AI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const market = useAppStore((state) => state.market);
  const setMarket = useAppStore((state) => state.setMarket);
  const clearLocal = useAppStore((state) => state.clearLocal);

  return (
    <div className="max-w-3xl">
      <PageHeader kicker="Settings" title="How this desk works" description="HK StockVision AI is an educational analytics product from HK SoftTech." />
      <Card className="space-y-4">
        <div>
          <p className="mb-2 text-sm text-muted">Theme</p>
          <Segmented label="Theme" value={theme} onChange={setTheme} options={[{ id: "dark", label: "Dark" }, { id: "light", label: "Light" }]} />
        </div>
        <div>
          <p className="mb-2 text-sm text-muted">Default board</p>
          <Segmented label="Default market" value={market} onChange={setMarket} options={[{ id: "All", label: "All" }, { id: "India", label: "India" }, { id: "US", label: "United States" }]} />
        </div>
        <Button
          variant="surface"
          onClick={() => {
            clearLocal();
            toast("Cleared watchlist, reports, and recent symbols on this device");
          }}
        >
          Clear saved items
        </Button>
      </Card>
      <Card className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
        <h2 className="text-base font-semibold text-fg">Data</h2>
        <p>Prices, splits, and dividends come from Yahoo Finance chart history. That source is unofficial and can change or fail. Every figure is delayed. The last daily close is what forecasts are anchored to. A quoted price, when shown, is labeled with its timestamp and is not treated as a live tape.</p>
        <h2 className="text-base font-semibold text-fg">Indicators</h2>
        <p>Moving averages, MACD, RSI, stochastic, rate of change, Bollinger bands, ATR, rolling volatility, on-balance volume, and return features are calculated here from the fetched bars. A feature used to predict a session only uses data available at that session's close.</p>
        <h2 className="text-base font-semibold text-fg">Models</h2>
        <p>Linear regression is ridge regression. Random forest is an average of shallow trees. Gradient boosting is a squared-error booster in the same family as XGBoost, not the XGBoost library. LSTM and GRU are small networks trained from scratch on that symbol's daily log returns. They are not large pretrained market models.</p>
        <p>Training is chronological. Metrics are from later sessions the fit did not see. A persistence baseline predicts that the price simply stays at the last close. Walk-forward RMSE is reported for linear regression. Tree and neural models use one holdout so a comparison stays fast enough to run when you ask.</p>
        <p>The chart path is a recursive rollout of one-step predictions. The headline price is a separate direct model of the full horizon return. Bands widen with the square root of the step using test residuals. They are not a probability.</p>
        <h2 className="text-base font-semibold text-fg">AI</h2>
        <p>The analyst receives the computed summary and is instructed not to invent prices or give buy and sell instructions. If the AI service is unavailable, the error is shown and the numbers you already generated remain usable. Watchlists and reports stay in this browser.</p>
        <h2 className="text-base font-semibold text-fg">Markets</h2>
        <p>Use Yahoo tickers. Indian listings generally need .NS for the NSE and .BO for the BSE. US listings use the plain symbol, such as AAPL. Indices use symbols such as ^NSEI or ^GSPC. Any valid Yahoo symbol can be searched. The preset list is only a shortcut.</p>
      </Card>
      <Disclaimer className="mt-4" />
    </div>
  );
}
