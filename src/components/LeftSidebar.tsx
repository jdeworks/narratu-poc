import { useProjectStore } from "../stores/project-store";
import { useThemeStore } from "../stores/theme-store";

interface SidebarProps {
  onNavigate: () => void;
}

export default function LeftSidebar({ onNavigate }: SidebarProps) {
  const { view, reset, setView } = useProjectStore();
  const { theme, toggle } = useThemeStore();

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]" role="navigation">
      {/* Logo header */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <button
          onClick={toggle}
          className="shrink-0 rounded-lg p-2.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
        <button
          onClick={reset}
          className="group relative text-lg font-bold hover:opacity-80"
          style={{ color: theme === "dark" ? "#38bdf8" : "#0f172a" }}
        >
          Narratu
          <span className="pointer-events-none absolute left-0 top-full mt-2 z-50 w-max max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-normal text-[var(--color-text-secondary)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            Latin for "you narrate"
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Pages */}
        <nav aria-label="Pages">
        <Section title="Pages">
          <NavItem
            label="Demo"
            active={view === "demo"}
            onClick={() => { setView("demo"); onNavigate(); }}
          />
          <NavItem
            label="Listen"
            active={view === "listen"}
            onClick={() => { setView("listen"); onNavigate(); }}
          />
          <NavItem
            label="How it works"
            active={view === "how-it-works"}
            onClick={() => { setView("how-it-works"); onNavigate(); }}
          />
          <NavItem
            label="For Investors"
            active={view === "investors"}
            onClick={() => { setView("investors"); onNavigate(); }}
          />
          <NavItem
            label="Survey"
            active={view === "survey"}
            onClick={() => { setView("survey"); onNavigate(); }}
          />
        </Section>
        </nav>

        {/* External links */}
        <Section title="Links">
          <ExternalLink label="My Other Projects" href="https://jdeworks.github.io" />
        </Section>
      </div>

      <div className="border-t border-[var(--color-border)] p-3">
        <button
          onClick={async () => {
            const localforage = (await import("localforage")).default;
            await localforage
              .createInstance({ name: "narratu", storeName: "analysis_cache" })
              .clear();
            await localforage
              .createInstance({ name: "narratu", storeName: "projects" })
              .clear();
            reset();
          }}
          className="mb-2 w-full rounded-md px-2 py-2.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-danger)]"
        >
          Clear all data
        </button>
        <p className="text-xs text-[var(--color-text-muted)]">
          Narratu PoC &middot; v1.0.0
        </p>
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-md px-2 py-3 text-left text-sm transition-colors ${
        active
          ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
      }`}
    >
      {label}
    </button>
  );
}

function ExternalLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full items-center gap-1.5 rounded-md px-2 py-3 text-left text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
    >
      {label}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-50">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
      </svg>
    </a>
  );
}
