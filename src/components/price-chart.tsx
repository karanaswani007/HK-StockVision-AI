import type { IndicatorPack } from "@/lib/market/indicators";
import type { Bar } from "@/lib/types";
import { useMemo, useState } from "react";
import { Bar as RBar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PriceChart({
  bars,
  pack,
  showSma20,
  showSma50,
  showBb,
}: {
  bars: Bar[];
  pack: IndicatorPack;
  showSma20: boolean;
  showSma50: boolean;
  showBb: boolean;
}) {
  const [mode, setMode] = useState<"line" | "candle">(bars.length > 220 ? "line" : "candle");
  const candleBars = bars.slice(-180);
  const data = useMemo(
    () =>
      bars.map((bar, index) => ({
        date: bar.date,
        close: bar.close,
        volume: bar.volume,
        sma20: showSma20 ? pack.sma20[index] : null,
        sma50: showSma50 ? pack.sma50[index] : null,
        upper: showBb ? pack.bbUpper[index] : null,
        lower: showBb ? pack.bbLower[index] : null,
      })),
    [bars, pack, showBb, showSma20, showSma50],
  );

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(["line", "candle"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={mode === item}
            className={mode === item ? "tint-accent min-h-11 rounded-md px-3 text-sm" : "min-h-11 rounded-md px-3 text-sm text-muted"}
            onClick={() => setMode(item)}
          >
            {item === "line" ? "Line" : "Candles"}
          </button>
        ))}
        {mode === "candle" && bars.length > candleBars.length ? (
          <span className="self-center text-xs text-faint">Candles show the latest {candleBars.length} sessions.</span>
        ) : null}
      </div>
      {mode === "line" ? (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="date" minTickGap={32} tick={{ fill: "var(--color-faint)", fontSize: 11 }} />
              <YAxis yAxisId="p" orientation="right" domain={["auto", "auto"]} tick={{ fill: "var(--color-faint)", fontSize: 11 }} width={68} />
              <YAxis yAxisId="v" hide domain={[0, (max: number) => max * 4]} />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, color: "var(--color-fg)" }}
                labelStyle={{ color: "var(--color-muted)" }}
              />
              <RBar yAxisId="v" dataKey="volume" fill="var(--color-line)" isAnimationActive={false} />
              {showBb ? <Line yAxisId="p" type="monotone" dataKey="upper" stroke="var(--color-accent-2)" dot={false} strokeDasharray="4 4" isAnimationActive={false} /> : null}
              {showBb ? <Line yAxisId="p" type="monotone" dataKey="lower" stroke="var(--color-accent-2)" dot={false} strokeDasharray="4 4" isAnimationActive={false} /> : null}
              {showSma20 ? <Line yAxisId="p" type="monotone" dataKey="sma20" name="SMA 20" stroke="var(--color-warn)" dot={false} strokeWidth={1.2} isAnimationActive={false} /> : null}
              {showSma50 ? <Line yAxisId="p" type="monotone" dataKey="sma50" name="SMA 50" stroke="var(--color-up)" dot={false} strokeWidth={1.2} isAnimationActive={false} /> : null}
              <Line yAxisId="p" type="monotone" dataKey="close" name="Close" stroke="var(--color-accent)" dot={false} strokeWidth={1.8} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <CandleChart bars={candleBars} pack={pack} offset={bars.length - candleBars.length} showSma20={showSma20} showSma50={showSma50} showBb={showBb} />
      )}
    </div>
  );
}

function CandleChart({
  bars,
  pack,
  offset,
  showSma20,
  showSma50,
  showBb,
}: {
  bars: Bar[];
  pack: IndicatorPack;
  offset: number;
  showSma20: boolean;
  showSma50: boolean;
  showBb: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (bars.length < 2) return <p className="text-sm text-muted">Not enough bars to draw candles.</p>;
  const W = 1000;
  const H = 420;
  const left = 8;
  const right = 72;
  const top = 16;
  const plotH = 280;
  const prices: number[] = [];
  bars.forEach((bar, index) => {
    const i = offset + index;
    prices.push(bar.high, bar.low);
    if (showSma20 && pack.sma20[i] != null) prices.push(pack.sma20[i] as number);
    if (showSma50 && pack.sma50[i] != null) prices.push(pack.sma50[i] as number);
    if (showBb && pack.bbUpper[i] != null && pack.bbLower[i] != null) prices.push(pack.bbUpper[i] as number, pack.bbLower[i] as number);
  });
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  const pad = (max - min) * 0.06 || 1;
  min -= pad;
  max += pad;
  const innerW = W - left - right;
  const slot = innerW / bars.length;
  const y = (price: number) => top + ((max - price) / (max - min)) * plotH;
  const maxVol = Math.max(...bars.map((bar) => bar.volume), 1);
  const volTop = top + plotH + 16;
  const volH = 70;
  const active = hover != null ? bars[hover] : null;

  function line(key: "sma20" | "sma50" | "bbUpper" | "bbLower") {
    let d = "";
    bars.forEach((_, index) => {
      const value = pack[key][offset + index];
      if (value == null) return;
      const x = left + slot * index + slot / 2;
      d += `${d ? "L" : "M"}${x.toFixed(1)},${y(value).toFixed(1)} `;
    });
    return d;
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-80 w-full"
        role="img"
        aria-label="Candlestick chart of historical prices"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * W;
          const index = Math.floor((x - left) / slot);
          setHover(index >= 0 && index < bars.length ? index : null);
        }}
      >
        {[0, 1, 2, 3].map((tick) => {
          const price = max - ((max - min) * tick) / 3;
          const yy = y(price);
          return (
            <g key={tick}>
              <line x1={left} x2={W - right} y1={yy} y2={yy} stroke="var(--color-line)" />
              <text x={W - right + 8} y={yy + 4} fill="var(--color-faint)" fontSize="12" fontFamily="IBM Plex Mono, monospace">
                {price.toFixed(price >= 100 ? 0 : 2)}
              </text>
            </g>
          );
        })}
        {bars.map((bar, index) => {
          const x = left + slot * index + slot / 2;
          const up = bar.close >= bar.open;
          const color = up ? "var(--color-up)" : "var(--color-down)";
          const body = Math.max(1.2, Math.abs(y(bar.open) - y(bar.close)));
          const bw = Math.max(1.4, slot * 0.58);
          return (
            <g key={bar.date + index}>
              <line x1={x} x2={x} y1={y(bar.high)} y2={y(bar.low)} stroke={color} />
              <rect x={x - bw / 2} y={Math.min(y(bar.open), y(bar.close))} width={bw} height={body} fill={color} />
              <rect x={x - bw / 2} y={volTop + volH - (bar.volume / maxVol) * volH} width={bw} height={(bar.volume / maxVol) * volH} fill={color} opacity="0.45" />
            </g>
          );
        })}
        {showBb ? <path d={line("bbUpper")} fill="none" stroke="var(--color-accent-2)" strokeDasharray="4 4" /> : null}
        {showBb ? <path d={line("bbLower")} fill="none" stroke="var(--color-accent-2)" strokeDasharray="4 4" /> : null}
        {showSma20 ? <path d={line("sma20")} fill="none" stroke="var(--color-warn)" strokeWidth="1.4" /> : null}
        {showSma50 ? <path d={line("sma50")} fill="none" stroke="var(--color-accent)" strokeWidth="1.4" /> : null}
        {hover != null ? <line x1={left + slot * hover + slot / 2} x2={left + slot * hover + slot / 2} y1={top} y2={volTop + volH} stroke="var(--color-muted)" strokeDasharray="3 3" /> : null}
        <text x={left} y={H - 8} fill="var(--color-faint)" fontSize="12">
          {bars[0].date}
        </text>
        <text x={W - right - 80} y={H - 8} fill="var(--color-faint)" fontSize="12">
          {bars[bars.length - 1].date}
        </text>
      </svg>
      {active ? (
        <p className="mt-2 font-mono text-xs text-muted">
          {active.date} O {active.open.toFixed(2)} H {active.high.toFixed(2)} L {active.low.toFixed(2)} C {active.close.toFixed(2)} V {Math.round(active.volume).toLocaleString("en-US")}
        </p>
      ) : (
        <p className="mt-2 text-xs text-faint">Hover a session for the open, high, low, close, and volume.</p>
      )}
    </div>
  );
}
