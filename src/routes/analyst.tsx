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
import { SymbolPicker } from "@/components/symbol-picker";
import { analyzeStock, chatStock } from "@/lib/api";
import { HORIZONS, RANGES, isHorizon, isRange, normalizeSymbol } from "@/lib/market/constants";
import { useAppStore } from "@/lib/store";
import type { AnalysisReport } from "@/lib/types";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/analyst")({
  validateSearch: (search: Record<string, unknown>) => ({
    symbol: normalizeSymbol(typeof search.symbol === "string" ? search.symbol : "") || "INFY.NS",
    range: typeof search.range === "string" && isRange(search.range) ? search.range : "1y",
    horizon:
      Number(search.horizon) && isHorizon(Number(search.horizon)) ? Number(search.horizon) : 5,
  }),
  head: () => ({ meta: [{ title: "AI Analyst · HK StockVision AI" }] }),
  component: AnalystPage,
});

const PROMPTS = [
  "Explain the RSI in plain language.",
  "Which model had the lowest test error, and did it beat persistence?",
  "What are the main risks in this history?",
  "Explain the forecast without telling me to buy or sell.",
];

function AnalystPage() {
  const initial = Route.useSearch();
  const saveReport = useAppStore((state) => state.saveReport);
  const [symbol, setSymbol] = useState(initial.symbol);
  const [range, setRange] = useState(initial.range);
  const [horizon, setHorizon] = useState(initial.horizon);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const analysis = useMutation({
    mutationFn: () => analyzeStock({ data: { symbol, range, horizon } }),
  });
  const chat = useMutation({
    mutationFn: (next: string) =>
      chatStock({ data: { symbol, range, horizon, question: next, history: messages } }),
    onSuccess: (result, next) => {
      if (result.ok)
        setMessages((current) => [
          ...current,
          { role: "user", content: next },
          { role: "assistant", content: result.text },
        ]);
      else
        setMessages((current) => [
          ...current,
          { role: "user", content: next },
          { role: "assistant", content: result.error },
        ]);
    },
  });

  const report = analysis.data && analysis.data.ok ? analysis.data.report : null;
  const meta = analysis.data && "meta" in analysis.data ? analysis.data.meta : undefined;

  function ask(text: string) {
    const next = text.trim();
    if (next.length < 2 || chat.isPending) return;
    setQuestion("");
    chat.mutate(next);
  }

  return (
    <div>
      <PageHeader
        kicker="AI analyst"
        title="Commentary after the math"
        description="Indicators and model scores are computed first. The analyst is only allowed to interpret that packet. It does not fetch its own prices."
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
              {RANGES.filter((item) => item.id !== "1mo").map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Forecast horizon">
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
              disabled={analysis.isPending || !symbol}
              onClick={() => analysis.mutate()}
            >
              {analysis.isPending ? "Working…" : "Analyze with AI"}
            </Button>
          </div>
        </div>
      </Card>
      {analysis.isPending ? (
        <LoadingBlock label="Training the five models, then writing a brief from those figures only." />
      ) : null}
      {analysis.isError ? (
        <ErrorNote
          message={analysis.error instanceof Error ? analysis.error.message : "Analysis failed."}
        />
      ) : null}
      {analysis.data && !analysis.data.ok ? <ErrorNote message={analysis.data.error} /> : null}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {report && meta ? (
            <Card>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{meta.name}</h2>
                  <p className="text-sm text-muted">
                    {meta.symbol} · close {meta.lastClose.toFixed(2)} {meta.currency} on{" "}
                    {meta.lastDate}
                    {analysis.data && analysis.data.ok && analysis.data.cached
                      ? " · cached brief"
                      : ""}
                  </p>
                </div>
                <Button
                  variant="surface"
                  onClick={() => {
                    saveReport({
                      id: crypto.randomUUID(),
                      symbol: meta.symbol,
                      name: meta.name,
                      title: `${meta.symbol} brief`,
                      report,
                      createdAt: new Date().toISOString(),
                      range,
                      horizon,
                    });
                    toast("Report saved on this device");
                  }}
                >
                  Save report
                </Button>
              </div>
              <ReportView report={report} />
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-muted">
                Run an analysis to get a structured brief: performance, indicators, how the models
                scored, and the risks in that evidence.
              </p>
            </Card>
          )}
        </div>
        <Card className="lg:col-span-2">
          <h2 className="text-sm font-medium">
            Ask about {symbol.trim().toUpperCase() || "this stock"}
          </h2>
          <div className="mt-3 flex max-h-80 flex-col gap-2 overflow-auto">
            {messages.length === 0 ? (
              <p className="text-sm text-muted">
                Questions use the same computed context. If a figure was not calculated, the answer
                should say it is unavailable.
              </p>
            ) : null}
            {messages.map((message, index) => (
              <p
                key={index}
                className={
                  message.role === "user"
                    ? "tint-accent rounded-md px-3 py-2 text-sm"
                    : "rounded-md bg-surface-2 px-3 py-2 text-sm leading-relaxed"
                }
              >
                {message.content}
              </p>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="rounded-md border border-line px-2 py-1 text-left text-xs text-muted hover:text-fg"
                onClick={() => ask(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className={fieldClass}
              value={question}
              placeholder="Ask about the numbers"
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") ask(question);
              }}
            />
            <Button disabled={chat.isPending} onClick={() => ask(question)}>
              {chat.isPending ? "…" : "Send"}
            </Button>
          </div>
          {chat.isPending ? (
            <p className="mt-2 text-xs text-faint">
              Checking the computed context before answering.
            </p>
          ) : null}
        </Card>
      </div>
      <Disclaimer className="mt-4" />
    </div>
  );
}

export function ReportView({ report }: { report: AnalysisReport }) {
  const blocks = [
    ["Executive summary", report.executiveSummary],
    ["Historical performance", report.historicalPerformance],
    ["Technical indicators", report.technicalInterpretation],
    ["Model comparison", report.modelComparison],
    ["Forecast reading", report.forecastInterpretation],
    ["Overall", report.overall],
  ];
  return (
    <div className="space-y-4">
      {blocks.map(([title, body]) => (
        <section key={title}>
          <h3 className="text-sm font-medium text-fg">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
        </section>
      ))}
      <List title="Factors that look constructive" items={report.bullishFactors} />
      <List title="Factors that look fragile" items={report.bearishFactors} />
      <List title="Risks" items={report.risks} />
      <p className="text-xs leading-relaxed text-faint">{report.disclaimer}</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
