import type { AnalysisReport } from "@/lib/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useState } from "react";

export type WatchItem = { symbol: string; name: string; addedAt: string };
export type RecentItem = { symbol: string; name: string; at: string };
export type SavedReport = {
  id: string;
  symbol: string;
  name: string;
  title: string;
  report: AnalysisReport;
  createdAt: string;
  range: string;
  horizon: number;
};
export type SavedRun = {
  symbol: string;
  model: string;
  horizon: number;
  changePct: number;
  at: string;
};

type State = {
  theme: "dark" | "light";
  market: "All" | "India" | "US";
  defaultRange: string;
  defaultHorizon: number;
  watchlist: WatchItem[];
  recent: RecentItem[];
  reports: SavedReport[];
  runs: SavedRun[];
  setTheme: (theme: "dark" | "light") => void;
  setMarket: (market: "All" | "India" | "US") => void;
  setDefaults: (range: string, horizon: number) => void;
  toggleWatch: (item: { symbol: string; name: string }) => void;
  addRecent: (item: { symbol: string; name: string }) => void;
  saveReport: (report: SavedReport) => void;
  removeReport: (id: string) => void;
  pushRun: (run: SavedRun) => void;
  clearLocal: () => void;
};

export const useAppStore = create<State>()(
  persist(
    (set, get) => ({
      theme: "dark",
      market: "All",
      defaultRange: "1y",
      defaultHorizon: 5,
      watchlist: [],
      recent: [],
      reports: [],
      runs: [],
      setTheme: (theme) => set({ theme }),
      setMarket: (market) => set({ market }),
      setDefaults: (defaultRange, defaultHorizon) => set({ defaultRange, defaultHorizon }),
      toggleWatch: (item) => {
        const exists = get().watchlist.some((row) => row.symbol === item.symbol);
        set({
          watchlist: exists
            ? get().watchlist.filter((row) => row.symbol !== item.symbol)
            : [{ symbol: item.symbol, name: item.name, addedAt: new Date().toISOString() }, ...get().watchlist].slice(0, 30),
        });
      },
      addRecent: (item) => {
        const rest = get().recent.filter((row) => row.symbol !== item.symbol);
        set({ recent: [{ ...item, at: new Date().toISOString() }, ...rest].slice(0, 8) });
      },
      saveReport: (report) => set({ reports: [report, ...get().reports.filter((row) => row.id !== report.id)].slice(0, 20) }),
      removeReport: (id) => set({ reports: get().reports.filter((row) => row.id !== id) }),
      pushRun: (run) => set({ runs: [run, ...get().runs].slice(0, 8) }),
      clearLocal: () => set({ watchlist: [], recent: [], reports: [], runs: [] }),
    }),
    { name: "hk-stockvision", skipHydration: true },
  ),
);

export function useHydrated() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void useAppStore.persist.rehydrate();
    setReady(true);
  }, []);
  return ready;
}
