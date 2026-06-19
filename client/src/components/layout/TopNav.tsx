import { useEffect, useState } from "react";
import { useUi } from "../../store/ui";
import { useJobs, useInvalidateLibrary } from "../../hooks/queries";
import { api } from "../../lib/api";
import {
  ImagesIcon,
  CopyIcon,
  MoonIcon,
  ScanIcon,
  SunIcon,
} from "../ui/icons";
import { Button } from "../ui/Modal";

function NavLink({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );
}

export function TopNav() {
  const { theme, toggleTheme, view, setView, search, setSearch } = useUi();
  const invalidate = useInvalidateLibrary();
  const [searchInput, setSearchInput] = useState(search);

  const { data: jobsData } = useJobs(true);
  const scanRunning = jobsData?.scanRunning ?? false;
  const dedupRunning = jobsData?.dedupRunning ?? false;
  const activeJob = jobsData?.jobs.find((j) => j.status === "running");

  // Refresh library data whenever a scan or dedup run transitions to finished.
  // TopNav is always mounted, so this keeps the sidebar stats (e.g. duplicate
  // group count) fresh regardless of which view is open.
  useEffect(() => {
    if (!scanRunning && !dedupRunning) invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanRunning, dedupRunning]);

  // Debounce the search box into the shared filter state.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput, setSearch]);

  return (
    <header className="z-20 flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
          S
        </div>
        <span className="text-lg font-bold tracking-tight">Siftr</span>
      </div>

      <nav className="flex items-center gap-1">
        <NavLink
          active={view === "library"}
          onClick={() => setView("library")}
          icon={<ImagesIcon />}
          label="Library"
        />
        <NavLink
          active={view === "duplicates"}
          onClick={() => setView("duplicates")}
          icon={<CopyIcon />}
          label="Duplicates"
        />
      </nav>

      <div className="flex flex-1 justify-center px-4">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search filenames…"
          className="w-full max-w-md rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-800 dark:focus:ring-brand-900/40"
        />
      </div>

      <div className="flex items-center gap-2">
        {activeJob && (
          <span className="hidden text-xs text-slate-500 md:inline">
            {activeJob.message ||
              `${activeJob.type}… ${activeJob.progress}/${activeJob.total}`}
          </span>
        )}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <SunIcon className="text-lg" /> : <MoonIcon className="text-lg" />}
        </button>
        <Button
          variant="primary"
          disabled={scanRunning}
          onClick={() => api.startScan().catch(() => {})}
        >
          <ScanIcon className={scanRunning ? "animate-spin" : ""} />
          {scanRunning ? "Scanning…" : "Scan"}
        </Button>
      </div>
    </header>
  );
}
