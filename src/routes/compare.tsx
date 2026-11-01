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
import { compareModels, getHistory } from "@/lib/api";
import { formatNumber, formatPct } from "@/lib/format";
import {
  HORIZONS,
  MODELS,
  RANGES,
  isHorizon,
  isRange,
  normalizeSymbol,
} from "@/lib/market/constants";
import type { ModelId, ModelRun } from "@/lib/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/compare")({
  validateSearch: (search: Record<string, unknown>) => ({
    symbol: normalizeSymbol(typeof search.symbol === "string" ? search.symbol : "") || "TCS.NS",
    range: typeof search.range === "string" && isRange(search.range) ? search.range : "1y",
    horizon:
      Number(search.horizon) && isHorizon(Number(search.horizon)) ? Number(search.horizon) : 5,
  }),
  head: () => ({ meta: [{ title: "Model comparison · HK StockVision AI" }] }),
  component: ComparePage,
});

function ComparePage() {
  const initial = Route.useSearch();
  const [symbol, setSymbol] = useState(initial.symbol);
  const [range, setRange] = useState(initial.range);
  const [horizon, setHorizon] = useState(initial.horizon);
  const [picked, setPicked] = useState<ModelId>("linear");
  const history = useQuery({
    queryKey: ["history", symbol, range, "1d"],
    queryFn: () => getHistory({ data: { symbol, range, interval: "1d" } }),
    enabled: false,
  });
  const mutation = useMutation({
    mutationFn: () => compareModels({ data: { symbol, range, horizon } }),
    onSuccess: (data) => {
      if (data.ok) {
        const first = data.results.find((item) => item.ok);
        if (first?.ok) setPicked(first.id);
        void history.refetch();
      }
    },
  });
  const payload = mutation.data?.ok ? mutation.data : null;
  const okRuns = payload?.results.filter((item): item is ModelRun => item.ok) ?? [];
  const selected = okRuns.find((item) => item.id === picked) ?? okRuns[0];
  const bars = okRuns.map((run) => ({
    name: MODELS.find((item) => item.id === run.id)?.short ?? run.name,
    model: run.oneStep.rmse,
    persistence: run.baselineOneStep.rmse,
  }));

  return (
    <div>
      <PageHeader
        kicker="Model bench"
        title="Same history, five fits"
        description="Models are ranked only on next-day error from a chronological test. If none beat persistence, the bench says so."
      />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Ticker">
            <SymbolPicker value={symbol} onChange={setSymbol} label="Ticker" />
          </Field>
          <Field label="History">
            <select
              className={fieldClass}
              value={range}
              onChange={(event) => setRange(event.target.value)}
            >
              {RANGES.filter((item) => item.id !== "1mo" && item.id !== "3mo").map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
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
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={mutation.isPending || !symbol}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Training all five…" : "Run comparison"}
            </Button>
          </div>
        </div>
      </Card>
      {mutation.isPending ? (
        <LoadingBlock label="Training linear, forest, boosting, LSTM, and GRU on the same daily history." />
      ) : null}
      {mutation.isError ? (
        <ErrorNote
          message={mutation.error instanceof Error ? mutation.error.message : "Comparison failed."}
        />
      ) : null}
      {mutation.data && !mutation.data.ok ? <ErrorNote message={mutation.data.error} /> : null}
      {payload ? (
        <div className="space-y-4">
          <Card>
            <p className="text-sm leading-relaxed text-fg">{payload.verdict}</p>
            <p className="mt-2 text-xs text-faint">
              {payload.meta.name} · {payload.meta.symbol} · close{" "}
              {payload.meta.lastClose.toFixed(2)} {payload.meta.currency} on {payload.meta.lastDate}
            </p>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-medium">Next-day test RMSE, lower is better</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars}>
                  <CartesianGrid stroke="var(--color-line)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "var(--color-faint)", fontSize: 12 }} />
                  <YAxis tick={{ fill: "var(--color-faint)", fontSize: 11 }} width={56} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-line)",
                      borderRadius: 12,
                      color: "var(--color-fg)",
                    }}
                  />
                  <Bar
                    dataKey="model"
                    name="Model RMSE"
                    fill="var(--color-accent)"
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="persistence"
                    name="Persistence RMSE"
                    fill="var(--color-line)"
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="text-xs text-faint">
                  <tr>
                    {[
                      "Model",
                      "RMSE",
                      "MAE",
                      "MAPE",
                      "R²",
                      "Direction",
                      "Vs persistence",
                      "Train",
                      "Test",
                    ].map((label) => (
                      <th key={label} className="py-2 pr-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload.results.map((item) =>
                    item.ok ? (
                      <tr key={item.id} className="border-t border-line">
                        <td className="py-2">
                          <button
                            type="button"
                            className={picked === item.id ? "text-accent" : "text-fg"}
                            onClick={() => setPicked(item.id)}
                          >
                            {item.name}
                            {payload.winnerId === item.id ? " · lowest RMSE" : ""}
                          </button>
                        </td>
                        <td className="py-2 font-mono">{formatNumber(item.oneStep.rmse, 3)}</td>
                        <td className="py-2 font-mono">{formatNumber(item.oneStep.mae, 3)}</td>
                        <td className="py-2 font-mono">
                          {item.oneStep.mape == null ? "—" : formatPct(item.oneStep.mape)}
                        </td>
                        <td className="py-2 font-mono">
                          {item.oneStep.r2 == null ? "—" : formatNumber(item.oneStep.r2, 3)}
                        </td>
                        <td className="py-2 font-mono">
                          {item.oneStep.directionalAccuracy == null
                            ? "—"
                            : formatPct(item.oneStep.directionalAccuracy * 100, 1)}
                        </td>
                        <td className="py-2">{item.beatsBaseline ? "Lower error" : "No edge"}</td>
                        <td className="py-2 font-mono">{item.trainMs} ms</td>
                        <td className="py-2 font-mono">{item.testSize}</td>
                      </tr>
                    ) : (
                      <tr key={item.id} className="border-t border-line">
                        <td className="py-2">{item.name}</td>
                        <td className="py-2 text-down" colSpan={8}>
                          {item.error}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-faint">
              Persistence predicts the next close equals the last close, so its directional accuracy
              is blank on purpose. Compare it on MAE and RMSE.
            </p>
          </Card>
          {selected ? (
            <ForecastPanel
              run={selected}
              currency={payload.meta.currency}
              bars={history.data?.ok ? history.data.bars : undefined}
            />
          ) : null}
        </div>
      ) : null}
      <Disclaimer className="mt-4" />
    </div>
  );
}
