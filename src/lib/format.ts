export function formatMoney(value: number, currency: string) {
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : 4;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return value.toFixed(digits);
  }
}

export function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

export function formatCompact(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPct(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatDay(unixSec: number, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(unixSec * 1000));
  } catch {
    return new Date(unixSec * 1000).toISOString().slice(0, 10);
  }
}

export function formatStamp(unixSec: number, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(unixSec * 1000));
  } catch {
    return new Date(unixSec * 1000).toISOString();
  }
}

export function round(n: number, digits = 4) {
  if (!Number.isFinite(n)) return null;
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}
