import { SearchBox } from "@/components/search-box";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAppStore, useHydrated } from "@/lib/store";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  FileText,
  LayoutDashboard,
  LineChart,
  Moon,
  Settings,
  Sparkles,
  Star,
  Sun,
  Layers,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/explorer", label: "Explorer", icon: LineChart },
  { to: "/predictions", label: "Predictions", icon: Sparkles },
  { to: "/compare", label: "Compare", icon: Layers },
  { to: "/analyst", label: "AI Analyst", icon: Bot },
  { to: "/watchlist", label: "Watchlist", icon: Star },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <path d="M7 22.5 12.5 16l4.2 3.2L25 9" fill="none" stroke="var(--color-on-accent)" strokeWidth="2" />
      <circle cx="25" cy="9" r="1.7" fill="var(--color-on-accent)" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const hydrated = useHydrated();
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme, hydrated]);

  return (
    <div className="relative min-h-dvh bg-bg text-fg">
      <div className="bg-grid pointer-events-none fixed inset-0" />
      <div className="relative flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <Link to="/" className="flex items-center gap-3 px-4 py-5">
            <Mark />
            <span>
              <span className="block text-sm font-semibold tracking-tight">HK StockVision AI</span>
              <span className="block text-xs text-faint">HK SoftTech</span>
            </span>
          </Link>
          <nav className="flex flex-1 flex-col gap-1 px-3">
            {NAV.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm",
                    active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <p className="px-4 py-4 text-xs leading-relaxed text-faint">Understand markets. Predict trends. Make informed decisions.</p>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center lg:px-6">
            <Link to="/" className="flex items-center gap-2 lg:hidden">
              <Mark />
              <span className="text-sm font-semibold">StockVision</span>
            </Link>
            <div className="min-w-0 flex-1">
              <SearchBox />
            </div>
            <Button
              variant="surface"
              aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
              <span className="hidden sm:inline">{theme === "light" ? "Dark" : "Light"}</span>
            </Button>
          </header>
          <main className="min-w-0 flex-1 px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
          <footer className="hidden border-t border-line px-8 py-4 text-xs text-faint lg:block">
            HK StockVision AI by HK SoftTech. Historical analytics for education. Not a broker and not financial advice.
          </footer>
        </div>
      </div>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface lg:hidden">
        {[
          NAV[0],
          NAV[1],
          NAV[2],
          NAV[4],
        ].map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to;
          return (
            <Link key={item.to} to={item.to} className={cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs", active ? "text-accent" : "text-muted")}>
              <Icon className="size-4" aria-hidden />
              {item.label === "AI Analyst" ? "Analyst" : item.label === "Predictions" ? "Predict" : item.label}
            </Link>
          );
        })}
        <button type="button" className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs text-muted" onClick={() => setMore(true)}>
          <Layers className="size-4" aria-hidden />
          More
        </button>
      </nav>
      {more ? (
        <div className="fixed inset-0 z-40 bg-bg/70 lg:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-lg border border-line bg-surface p-4" onClick={(event) => event.stopPropagation()}>
            <div className="grid grid-cols-2 gap-2">
              {NAV.slice(3).map((item) => (
                <Link key={item.to} to={item.to} onClick={() => setMore(false)} className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm">
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              ))}
            </div>
            <Button variant="ghost" className="mt-3 w-full" onClick={() => setMore(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
