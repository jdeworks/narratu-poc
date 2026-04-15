import { useState } from "react";
import { useProjectStore } from "./stores/project-store";
import { useThemeStore } from "./stores/theme-store";
import ErrorBoundary from "./components/ErrorBoundary";
import LeftSidebar from "./components/LeftSidebar";
import InvestorPage from "./components/InvestorPage";
import SurveyPage from "./components/SurveyPage";
import HowItWorksPage from "./components/HowItWorksPage";
import DemoPage from "./components/DemoPage";

export default function App() {
  const view = useProjectStore((s) => s.view);
  const theme = useThemeStore((s) => s.theme);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ErrorBoundary>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--color-primary)] focus:px-4 focus:py-2 focus:text-[var(--color-primary-text)]">
        Skip to main content
      </a>
      <div className="flex h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
        {/* Desktop sidebar — always visible */}
        <div className="hidden sm:flex">
          <LeftSidebar onNavigate={() => {}} />
        </div>

        {/* Mobile overlay + drawer */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative h-full w-64" onClick={(e) => e.stopPropagation()}>
              <LeftSidebar onNavigate={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile header bar */}
          <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-2 sm:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-3 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
              aria-label="Open menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <span
              className="text-lg font-bold"
              style={{ color: theme === "dark" ? "#38bdf8" : "#0f172a" }}
            >
              Narratu
            </span>
          </div>

          <main id="main-content" className="flex-1 overflow-auto">
            {view === "demo" && <DemoPage />}
            {view === "how-it-works" && <HowItWorksPage />}
            {view === "investors" && <InvestorPage />}
            {view === "survey" && <SurveyPage />}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
