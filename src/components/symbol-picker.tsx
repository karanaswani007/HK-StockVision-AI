import { searchStocks } from "@/lib/api";
import { fieldClass } from "@/components/ui";
import type { SearchHit } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const POPULAR_SYMBOLS: SearchHit[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "Equity" },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", type: "Equity" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", type: "Equity" },
  { symbol: "0700.HK", name: "Tencent Holdings Limited", exchange: "Hong Kong", type: "Equity" },
  { symbol: "0005.HK", name: "HSBC Holdings plc", exchange: "Hong Kong", type: "Equity" },
  { symbol: "RELIANCE.NS", name: "Reliance Industries Limited", exchange: "NSE", type: "Equity" },
  { symbol: "TCS.NS", name: "Tata Consultancy Services Limited", exchange: "NSE", type: "Equity" },
  { symbol: "INFY.NS", name: "Infosys Limited", exchange: "NSE", type: "Equity" },
];

export function SymbolPicker({
  value,
  onChange,
  label = "Search stocks",
  placeholder = "Search by company or ticker",
}: {
  value: string;
  onChange: (symbol: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const [queryText, setQueryText] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setText(value);
  }, [value]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(queryText.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryText]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !box.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const query = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => searchStocks({ data: { q: debouncedQuery } }),
    enabled: open && debouncedQuery.length > 0,
  });
  const hits = debouncedQuery ? (query.data?.ok ? query.data.hits : []) : POPULAR_SYMBOLS;
  const listId = "symbol-picker-options";

  function select(hit: SearchHit) {
    setText(hit.symbol);
    setQueryText("");
    setOpen(false);
    onChange(hit.symbol);
  }

  return (
    <div className="relative" ref={box}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
        aria-hidden
      />
      <input
        className={`${fieldClass} pl-9`}
        placeholder={placeholder}
        value={text}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && hits[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setQueryText(event.target.value);
          setActiveIndex(0);
          setOpen(true);
          onChange("");
        }}
        onFocus={() => {
          setQueryText(text);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setText(value);
          } else if (event.key === "ArrowDown" && open && hits.length) {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % hits.length);
          } else if (event.key === "ArrowUp" && open && hits.length) {
            event.preventDefault();
            setActiveIndex((index) => (index - 1 + hits.length) % hits.length);
          } else if (event.key === "Enter" && open && hits[activeIndex]) {
            event.preventDefault();
            select(hits[activeIndex]);
          }
        }}
      />
      {open ? (
        <div
          id={listId}
          className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-lg"
          role="listbox"
          aria-label="Ticker suggestions"
        >
          {!debouncedQuery ? (
            <p className="px-3 py-2 text-xs font-medium text-faint">Popular tickers</p>
          ) : query.isFetching ? (
            <p className="px-3 py-3 text-sm text-muted">Searching stocks…</p>
          ) : query.data && !query.data.ok ? (
            <p className="px-3 py-3 text-sm text-down">{query.data.error}</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">
              No matching stocks found. Try a company name or ticker.
            </p>
          ) : null}
          {hits.map((hit, index) => (
            <button
              key={hit.symbol}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left hover:bg-surface-2 ${
                index === activeIndex ? "bg-surface-2" : ""
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(hit)}
            >
              <span className="min-w-0">
                <span className="font-mono text-sm text-fg">{hit.symbol}</span>
                <span className="mt-0.5 block truncate text-xs text-muted">{hit.name}</span>
              </span>
              <span className="shrink-0 text-xs text-faint">{hit.exchange || hit.type}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
