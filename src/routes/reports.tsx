import { ReportView } from "@/routes/analyst";
import { Button, Card, Disclaimer, PageHeader } from "@/components/ui";
import { useAppStore, useHydrated } from "@/lib/store";
import type { SavedReport } from "@/lib/store";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports · HK StockVision AI" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const hydrated = useHydrated();
  const reports = useAppStore((state) => state.reports);
  const removeReport = useAppStore((state) => state.removeReport);
  const [open, setOpen] = useState<string | null>(null);
  const selected = reports.find((report) => report.id === open) ?? reports[0];

  return (
    <div>
      <PageHeader kicker="Reports" title="Briefs you saved" description="Stored on this device. Download an HTML file and print it to PDF from your browser if you want a copy." />
      {!hydrated || reports.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No saved briefs yet. Generate one from the AI analyst and press Save report.</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <div className="space-y-2">
            {reports.map((report) => (
              <button key={report.id} type="button" onClick={() => setOpen(report.id)} className={`w-full rounded-md border px-3 py-3 text-left ${selected?.id === report.id ? "border-accent bg-surface" : "border-line"}`}>
                <span className="block text-sm font-medium">{report.symbol}</span>
                <span className="mt-1 block text-xs text-faint">{new Date(report.createdAt).toLocaleString()}</span>
              </button>
            ))}
          </div>
          {selected ? (
            <Card>
              <div className="mb-4 flex flex-wrap gap-2">
                <Button variant="surface" onClick={() => downloadReport(selected)}>Download HTML</Button>
                <Button variant="ghost" onClick={() => removeReport(selected.id)}>Delete</Button>
              </div>
              <h2 className="mb-4 text-lg font-semibold">{selected.name}</h2>
              <ReportView report={selected.report} />
            </Card>
          ) : null}
        </div>
      )}
      <Disclaimer className="mt-4" />
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "\u0026amp;";
    if (char === "<") return "\u0026lt;";
    if (char === ">") return "\u0026gt;";
    if (char === '"') return "\u0026quot;";
    return "\u0026#39;";
  });
}

function downloadReport(report: SavedReport) {
  const list = (items: string[]) => (items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>None listed.</p>");
  const section = (title: string, body: string) => `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.symbol)} · HK StockVision AI</title>
    <style>body{font-family:Georgia,serif;max-width:740px;margin:40px auto;padding:0 16px;color:#172033;line-height:1.5}h1,h2{font-family:Arial,sans-serif}p,li{font-size:16px}.note{color:#52627c;font-size:13px}</style></head><body>
    <p class="note">HK StockVision AI · HK SoftTech · ${escapeHtml(report.createdAt)}</p>
    <h1>${escapeHtml(report.name)} (${escapeHtml(report.symbol)})</h1>
    ${section("Executive summary", report.report.executiveSummary)}
    ${section("Historical performance", report.report.historicalPerformance)}
    ${section("Technical indicators", report.report.technicalInterpretation)}
    ${section("Model comparison", report.report.modelComparison)}
    ${section("Forecast reading", report.report.forecastInterpretation)}
    <h2>Constructive factors</h2>${list(report.report.bullishFactors)}
    <h2>Fragile factors</h2>${list(report.report.bearishFactors)}
    <h2>Risks</h2>${list(report.report.risks)}
    ${section("Overall", report.report.overall)}
    <p class="note">${escapeHtml(report.report.disclaimer)}</p>
    </body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.symbol}-stockvision-report.html`;
  link.click();
  URL.revokeObjectURL(url);
}
