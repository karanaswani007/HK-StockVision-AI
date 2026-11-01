import { SymbolPicker } from "@/components/symbol-picker";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export function SearchBox() {
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState("");

  return (
    <SymbolPicker
      value={symbol}
      onChange={(picked) => {
        if (!picked) return;
        setSymbol("");
        void navigate({ to: "/explorer", search: { symbol: picked, range: "1y", interval: "1d" } });
      }}
      placeholder="Search company or select a popular ticker"
    />
  );
}
