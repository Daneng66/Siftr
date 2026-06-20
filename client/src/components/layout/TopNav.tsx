import { useEffect, useRef, useState } from "react";
import { useUi } from "../../store/ui";
import { useJobs, useInvalidateLibrary } from "../../hooks/queries";
import { api } from "../../lib/api";
import {
  ImagesIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  MoonIcon,
  ScanIcon,
  SunIcon,
  XIcon,
} from "../ui/icons";
import { Button, Modal } from "../ui/Modal";

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

  const [scanMenuOpen, setScanMenuOpen] = useState(false);
  const [hardScanConfirm, setHardScanConfirm] = useState(false);

  const { data: jobsData } = useJobs(true);
  const scanRunning = jobsData?.scanRunning ?? false;
  const dedupRunning = jobsData?.dedupRunning ?? false;
  const activeJob =
    (scanRunning || dedupRunning)
      ? jobsData?.jobs.find((j) => j.status === "running")
      : undefined;

  // Transient "scan finished" toast. We key off the id of the most recent
  // finished scan job rather than a running→idle transition, so even a scan
  // that completes between polls still surfaces a result.
  const [scanToast, setScanToast] = useState<{ message: string; error: boolean } | null>(null);
  const lastScanJobId = useRef<string | null>(null);

  useEffect(() => {
    const latestScan = jobsData?.jobs.find(
      (j) => j.type === "scan" && j.status !== "running"
    );
    if (!latestScan) return;
    // First observation after mount: remember it without toasting for a scan
    // that finished before the page was even open.
    if (lastScanJobId.current === null) {
      lastScanJobId.current = latestScan.id;
      return;
    }
    if (latestScan.id !== lastScanJobId.current) {
      lastScanJobId.current = latestScan.id;
      setScanToast({
        message: latestScan.error || latestScan.message || "No changes",
        error: !!latestScan.error,
      });
    }
  }, [jobsData]);

  // Auto-dismiss the toast a few seconds after it appears.
  useEffect(() => {
    if (!scanToast) return;
    const t = setTimeout(() => setScanToast(null), 5000);
    return () => clearTimeout(t);
  }, [scanToast]);

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
          <span className="text-xs text-slate-500">
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
        <div className="relative flex">
          <Button
            variant="primary"
            disabled={scanRunning}
            className="rounded-r-none"
            onClick={() => api.startScan().catch(() => {})}
          >
            <ScanIcon className={scanRunning ? "animate-spin" : ""} />
            {scanRunning ? "Scanning…" : "Scan"}
          </Button>
          <Button
            variant="primary"
            disabled={scanRunning}
            aria-label="Scan options"
            aria-haspopup="menu"
            aria-expanded={scanMenuOpen}
            className="ml-px rounded-l-none px-2"
            onClick={() => setScanMenuOpen((o) => !o)}
          >
            <ChevronDownIcon />
          </Button>
          {scanMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setScanMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              >
                <button
                  role="menuitem"
                  disabled={dedupRunning}
                  className="block w-full px-3 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-700"
                  onClick={() => {
                    setScanMenuOpen(false);
                    api.startDedup().catch(() => {});
                  }}
                >
                  <span className="text-sm font-medium">
                    {dedupRunning ? "Scanning duplicates…" : "Scan for duplicates"}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    Find duplicate groups without re-indexing photos
                  </span>
                </button>
                <button
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => {
                    setScanMenuOpen(false);
                    setHardScanConfirm(true);
                  }}
                >
                  <span className="text-sm font-medium">Hard Scan</span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    Clear all data &amp; thumbnails, then rebuild
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={hardScanConfirm}
        onClose={() => setHardScanConfirm(false)}
        title="Hard scan?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setHardScanConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setHardScanConfirm(false);
                api.startScan(true).catch(() => {});
              }}
            >
              Clear &amp; rebuild
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This clears the entire photo index, all duplicate groups, and every
          cached thumbnail, then rebuilds everything from the files on disk,
          including the folder structure.
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Your photo files on disk are not touched.
        </p>
      </Modal>

      {scanToast && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg ${
            scanToast.error
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-200"
          }`}
        >
          {scanToast.error ? (
            <XIcon className="mt-0.5 shrink-0 text-base" />
          ) : (
            <CheckIcon className="mt-0.5 shrink-0 text-base" />
          )}
          <div className="flex-1">
            <p className="font-medium">
              {scanToast.error ? "Scan failed" : "Scan complete"}
            </p>
            <p className="mt-0.5 opacity-90">{scanToast.message}</p>
          </div>
          <button
            onClick={() => setScanToast(null)}
            className="-mr-1 -mt-0.5 shrink-0 rounded p-1 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            <XIcon className="text-sm" />
          </button>
        </div>
      )}
    </header>
  );
}
