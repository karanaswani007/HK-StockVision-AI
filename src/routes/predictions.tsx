import { ForecastPanel } from "@/components/forecast-panel";
import { SymbolPicker } from "@/components/symbol-picker";
import {
  Button,
  Card,
  Disclaimer,
  ErrorNote,
  Field,
  LoadingBlock,
  PageHeader,
  fieldClass,
} from "@/components/ui";
import { generatePrediction, getHistory } from "@/lib/api";
import {
  HORIZONS,
  MODELS,
  RANGES,
  isHorizon,
  isModel,
  isRange,
  normalizeSymbol,
} from "@/lib/market/constants";
import { useAppStore } from "@/lib/store";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/predictions")({
  validateSearch: (search: Record<string, unknown>) => ({
    symbol:
      normalizeSymbol(typeof search.symbol === "string" ? search.symbol : "") || "RELIANCE.NS",
    range: typeof search.range === "string" && isRange(search.range) ? search.range : "1y",
    horizon:
      typeof search.horizon === "number" && isHorizon(search.horizon)
        ? search.horizon
        : Number(search.horizon) && isHorizon(Number(search.horizon))
          ? Number(search.horizon)
          : 5,
    model:
      typeof search.model === "string" && (search.model === "all" || isModel(search.model))
        ? search.model
        : "linear",
  }),
  head: () => ({ meta: [{ title: "Predictions · HK StockVision AI" }] }),
  component: PredictionPage,
});

function PredictionPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const pushRun = useAppStore((state) => state.pushRun);
  const [symbol, setSymbol] = useState(search.symbol);
  const [range, setRange] = useState(search.range);
  const [horizon, setHorizon] = useState(search.horizon);
  const [model, setModel] = useState(search.model);
  const seen = useRef("");
  const history = useQuery({
    queryKey: ["history", search.symbol, search.range, "1d"],
    queryFn: () =>
      getHistory({ data: { symbol: search.symbol, range: search.range, interval: "1d" } }),
  });
  const mutation = useMutation({
    mutationFn: () =>
      generatePrediction({
        data: { symbol, range, horizon, model: model === "all" ? "linear" : model },
      }),
  });

  useEffect(() => {
    setSymbol(search.symbol);
    setRange(search.range);
    setHorizon(search.horizon);
    setModel(search.model);
  }, [search.symbol, search.range, search.horizon, search.model]);

  useEffect(() => {
    const data = mutation.data;
    if (!data?.ok || data.kind !== "one") return;
    const key = `${data.meta.symbol}:${data.result.id}:${data.result.directPrice}:${data.result.anchorDate}`;
    if (seen.current === key) return;
    seen.current = key;
    pushRun({
      symbol: data.meta.symbol,
      model: data.result.name,
      horizon: data.result.horizon,
      changePct: data.result.directChangePct,
      at: new Date().toISOString(),
    });
  }, [mutation.data, pushRun]);

  function submit() {
    if (model === "all") {
      void navigate({
        to: "/compare",
        search: { symbol: symbol.trim().toUpperCase(), range, horizon },
      });
      return;
    }
    void navigate({
      to: "/predictions",
      search: { symbol: symbol.trim().toUpperCase(), range, horizon, model },
    });
    mutation.mutate();
  }

  const result = mutation.data?.ok && mutation.data.kind === "one" ? mutation.data : null;

  return (
    <div>
      <PageHeader
        kicker="Prediction studio"
        title="Train on this history"
        description="Each run fits the chosen model on the symbol you select, scores it on later sessions, then projects forward. It does not look up a stored forecast."
      />
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card className="h-fit space-y-3">
          <Field label="Ticker">
            <SymbolPicker value={symbol} onChange={setSymbol} label="Ticker" />
          </Field>
          <Field label="History">
            <select
              className={fieldClass}
              value={range}
              onChange={(event) => setRange(event.target.value)}
            >
              {RANGES.filter((item) => item.id !== "1mo").map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label === "Max" ? "Maximum" : item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Horizon">
            <select
              className={fieldClass}
              value={horizon}
              onChange={(event) => setHorizon(Number(event.target.value))}
            >
              {HORIZONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model">
            <select
              className={fieldClass}
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              {MODELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
              <option value="all">Compare all models</option>
            </select>
          </Field>
          <Button className="w-full" disabled={mutation.isPending || !symbol} onClick={submit}>
            {mutation.isPending
              ? "Training…"
              : model === "all"
                ? "Compare models"
                : "Generate prediction"}
          </Button>
          <p className="text-xs leading-relaxed text-faint">
            Deep models take longer because they train here, on this series, when you ask.
          </p>
        </Card>
        <div>
          {!mutation.data && !mutation.isPending && !mutation.isError ? (
            <Card>
              <p className="text-sm text-muted">
                Choose a symbol and generate a prediction. A good starting point is one year of
                daily data and a 5-session horizon.
              </p>
              <Link
                to="/explorer"
                search={{ symbol: search.symbol, range: "1y", interval: "1d" }}
                className="mt-3 inline-block text-sm text-accent"
              >
                Review {search.symbol} first
              </Link>
            </Card>
          ) : null}
          {mutation.isPending ? (
            <LoadingBlock label="Fitting the model on chronological history. This stays on the server." />
          ) : null}
          {mutation.isError ? (
            <ErrorNote
              message={
                mutation.error instanceof Error ? mutation.error.message : "Prediction failed."
              }
            />
          ) : null}
          {mutation.data && !mutation.data.ok ? <ErrorNote message={mutation.data.error} /> : null}
          {result ? (
            <ForecastPanel
              run={result.result}
              currency={result.meta.currency}
              bars={
                history.data?.ok && history.data.meta.symbol === result.meta.symbol
                  ? history.data.bars
                  : undefined
              }
            />
          ) : null}
        </div>
      </div>
      <Disclaimer className="mt-4" />
    </div>
  );
}
