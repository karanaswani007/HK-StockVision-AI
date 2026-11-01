import { ChangePill, Card } from "@/components/ui";
import { formatMoney, formatNumber, formatPct } from "@/lib/format";
import type { Bar, Metrics, ModelRun } from "@/lib/types";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function MetricGrid({ title, model, baseline }: { title: string; model: Metrics; baseline: Metrics }) {
  const rows = [
    ["MAE", formatNumber(model.mae, 3), formatNumber(baseline.mae, 3)],
    ["RMSE", formatNumber(model.rmse, 3), formatNumber(baseline.rmse, 3)],
    ["MAPE", model.mape == null ? "—" : formatPct(model.mape), baseline.mape == null ? "—" : formatPct(baseline.mape)],
    ["R²", model.r2 == null ? "—" : formatNumber(model.r2, 3), baseline.r2 == null ? "—" : formatNumber(baseline.r2, 3)],
    ["Direction", model.directionalAccuracy == null ? "—" : formatPct(model.directionalAccuracy * 100, 1), baseline.directionalAccuracy == null ? "—" : formatPct(baseline.directionalAccuracy * 100, 1)],
  ];
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-fg">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="text-xs text-faint">
            <tr>
              <th className="py-2 font-medium">Metric</th>
              <th className="py-2 font-medium">Model</th>
              <th className="py-2 font-medium">Persistence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-t border-line">
                <td className="py-2 text-muted">{row[0]}</td>
                <td className="py-2 font-mono">{row[1]}</td>
                <td className="py-2 font-mono text-muted">{row[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ForecastPanel({ run, currency, bars }: { run: ModelRun; currency: string; bars?: Bar[] }) {
  const history = (bars ?? []).slice(-160);
  const chart = [
    ...history.map((bar, index) => ({
      date: bar.date,
      actual: bar.close,
      forecast: index === history.length - 1 ? run.anchoredClose : null,
      low: null as number | null,
      high: null as number | null,
    })),
    ...run.path.map((point) => ({ date: point.date, actual: null as number | null, forecast: point.price, low: point.low, high: point.high })),
  ];
  const test = run.testSeries.map((point) => ({ date: point.date, actual: point.actual, predicted: point.predicted }));

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-widest text-accent uppercase">{run.name}</p>
            <p className="mt-2 font-mono text-3xl text-fg">{formatMoney(run.directPrice, currency)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ChangePill value={run.directChangePct} />
              <span className="text-xs text-muted">direct {run.horizon}-session estimate vs close on {run.anchorDate}</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              Approximate band {formatMoney(run.directLow, currency)} to {formatMoney(run.directHigh, currency)}
            </p>
          </div>
          <div className="text-sm text-muted">
            <p>Anchored to last daily close</p>
            <p className="font-mono text-fg">{formatMoney(run.anchoredClose, currency)}</p>
            <p className="mt-2">Recursive rollout ends at</p>
            <p className="font-mono text-fg">
              {formatMoney(run.rolloutPrice, currency)} <span className="text-muted">({formatPct(run.rolloutChangePct)})</span>
            </p>
            <p className="mt-2 text-xs">{run.beatsBaseline ? "Beat persistence on next-day test RMSE." : "Did not beat persistence on next-day test RMSE."}</p>
          </div>
        </div>
        {run.warnings.length ? (
          <ul className="mt-4 space-y-1 text-sm text-warn">
            {run.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-faint">{run.note}</p>
      </Card>
      <Card>
        <h3 className="mb-1 text-sm font-medium">History and forecast path</h3>
        <p className="mb-3 text-xs text-faint">Solid line is observed close. Dashed line is the recursive rollout, not observed data. The vertical gap at the last close is the forecast boundary.</p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="date" minTickGap={28} tick={{ fill: "var(--color-faint)", fontSize: 11 }} />
              <YAxis orientation="right" domain={["auto", "auto"]} tick={{ fill: "var(--color-faint)", fontSize: 11 }} width={68} />
              <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, color: "var(--color-fg)" }} />
              <Line type="monotone" dataKey="actual" name="Observed" stroke="var(--color-fg)" dot={false} strokeWidth={1.8} connectNulls={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="forecast" name="Rollout" stroke="var(--color-accent)" dot={false} strokeDasharray="5 4" strokeWidth={1.8} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="high" name="Upper sketch" stroke="var(--color-accent-2)" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="low" name="Lower sketch" stroke="var(--color-accent-2)" dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <MetricGrid title="Next-day test" model={run.oneStep} baseline={run.baselineOneStep} />
        </Card>
        <Card>
          <MetricGrid title={`${run.horizon}-day direct test`} model={run.horizonMetrics} baseline={run.baselineHorizon} />
        </Card>
      </div>
      <Card>
        <h3 className="mb-2 text-sm font-medium">Untouched test window: actual vs one-step prediction</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={test} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="date" minTickGap={28} tick={{ fill: "var(--color-faint)", fontSize: 11 }} />
              <YAxis orientation="right" domain={["auto", "auto"]} tick={{ fill: "var(--color-faint)", fontSize: 11 }} width={68} />
              <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, color: "var(--color-fg)" }} />
              <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--color-fg)" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="predicted" name="Predicted" stroke="var(--color-accent)" dot={false} strokeDasharray="4 3" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-faint">
          Train {run.trainSize} sessions · test {run.testSize} · trained in {run.trainMs} ms
          {run.walkForwardRmse != null ? ` · linear walk-forward RMSE ${formatNumber(run.walkForwardRmse, 3)}` : ""}
        </p>
      </Card>
      <Card>
        <h3 className="mb-2 text-sm font-medium">Rollout table</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-xs text-faint">
              <tr>
                <th className="py-2 font-medium">Estimated session</th>
                <th className="py-2 font-medium">Rollout price</th>
                <th className="py-2 font-medium">Lower sketch</th>
                <th className="py-2 font-medium">Upper sketch</th>
              </tr>
            </thead>
            <tbody>
              {run.path.map((point) => (
                <tr key={point.date} className="border-t border-line">
                  <td className="py-2 font-mono">{point.date}</td>
                  <td className="py-2 font-mono">{formatMoney(point.price, currency)}</td>
                  <td className="py-2 font-mono text-muted">{formatMoney(point.low, currency)}</td>
                  <td className="py-2 font-mono text-muted">{formatMoney(point.high, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">{run.intervalNote}</p>
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer text-fg">How this forecast was built</summary>
          <p className="mt-2 leading-relaxed">{run.strategyNote}</p>
        </details>
      </Card>
      {run.importance.length ? (
        <Card>
          <h3 className="mb-3 text-sm font-medium">What the model leaned on</h3>
          <ul className="space-y-2">
            {run.importance.map((item) => (
              <li key={item.name}>
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>{item.name}</span>
                  <span className="font-mono">{Math.round(item.value * 100)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(4, item.value * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-faint">Relative weight inside this fit. Not a cause of future returns.</p>
        </Card>
      ) : null}
    </div>
  );
}
