import { useEffect, useRef, useState } from "react";
import { useUi } from "../../store/ui";
import {
  useJobs,
  useInvalidateLibrary,
  useResetLibrary,
  useTrash,
} from "../../hooks/queries";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import {
  ImagesIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  MoonIcon,
  ScanIcon,
  SpinnerIcon,
  SunIcon,
  TrashIcon,
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

/**
 * Trash icon + dropdown summarising what's in the `.trash` directory, with
 * "Restore all" and "Delete all" actions. Each action requires a second
 * confirming click and shows a spinner while it runs.
 */
function TrashMenu() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLibrary();
  const { data: trash } = useTrash();
  const count = trash?.count ?? 0;

  const [open, setOpen] = useState(false);
  // Which action is armed for its confirming second click ("restore"/"empty"),
  // and which (if any) is currently running.
  const [confirm, setConfirm] = useState<"restore" | "empty" | null>(null);
  const [busy, setBusy] = useState<"restore" | "empty" | null>(null);

  // Reset any pending confirmation whenever the menu closes.
  useEffect(() => {
    if (!open) setConfirm(null);
  }, [open]);

  async function run(action: "restore" | "empty") {
    if (confirm !== action) {
      setConfirm(action);
      return;
    }
    setBusy(action);
    try {
      if (action === "restore") await api.restoreTrash();
      else await api.emptyTrash();
      await qc.invalidateQueries({ queryKey: ["trash"] });
      invalidate();
    } catch (err) {
      console.error("[trash]", action, "failed:", err);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  return (
    <div className="relative flex">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Trash"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <TrashIcon className="text-lg" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="border-b border-slate-200 px-3 py-2.5 dark:border-slate-700">
              <p className="text-sm font-medium">Trash</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {count === 0
                  ? "Trash is empty"
                  : `${count} file${count === 1 ? "" : "s"} · ${formatBytes(
                      trash?.size ?? 0
                    )}`}
              </p>
            </div>
            <div className="p-1.5">
              <button
                role="menuitem"
                disabled={count === 0 || busy !== null}
                onClick={() => run("restore")}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-700"
              >
                {busy === "restore" ? (
                  <SpinnerIcon className="shrink-0 animate-spin" />
                ) : (
                  <ImagesIcon className="shrink-0" />
                )}
                <span className={confirm === "restore" ? "font-medium text-brand-600 dark:text-brand-400" : ""}>
                  {busy === "restore"
                    ? "Restoring…"
                    : confirm === "restore"
                      ? "Click again to confirm"
                      : "Restore all"}
                </span>
              </button>
              <button
                role="menuitem"
                disabled={count === 0 || busy !== null}
                onClick={() => run("empty")}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                {busy === "empty" ? (
                  <SpinnerIcon className="shrink-0 animate-spin" />
                ) : (
                  <TrashIcon className="shrink-0" />
                )}
                <span className={confirm === "empty" ? "font-semibold" : ""}>
                  {busy === "empty"
                    ? "Deleting…"
                    : confirm === "empty"
                      ? "Click again to confirm"
                      : "Delete all"}
                </span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TopNav() {
  const { theme, toggleTheme, view, setView, search, setSearch } = useUi();
  const invalidate = useInvalidateLibrary();
  const reset = useResetLibrary();
  const [searchInput, setSearchInput] = useState(search);

  const [scanMenuOpen, setScanMenuOpen] = useState(false);
  const [hardScanConfirm, setHardScanConfirm] = useState(false);
  const [regenThumbConfirm, setRegenThumbConfirm] = useState(false);

  const { data: jobsData } = useJobs(true);
  const scanRunning = jobsData?.scanRunning ?? false;
  const dedupRunning = jobsData?.dedupRunning ?? false;
  const thumbRunning = jobsData?.thumbRunning ?? false;
  const hardScanRunning = jobsData?.hardScanRunning ?? false;
  const activeJob =
    (scanRunning || dedupRunning || thumbRunning)
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

  // A hard scan wipes the index; the moment one starts, drop the browsable
  // library caches so no stale photos linger behind the "rebuilding" state.
  useEffect(() => {
    if (hardScanRunning) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardScanRunning]);

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
        <TrashMenu />
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
                  disabled={thumbRunning}
                  className="block w-full px-3 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-700"
                  onClick={() => {
                    setScanMenuOpen(false);
                    setRegenThumbConfirm(true);
                  }}
                >
                  <span className="text-sm font-medium">
                    {thumbRunning ? "Generating thumbnails…" : "Regenerate thumbnails"}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    Clear cached thumbnails and rebuild them all
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
                // Blank the app to its pre-scan state immediately, rather than
                // waiting for the server to report the index cleared.
                reset();
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

      <Modal
        open={regenThumbConfirm}
        onClose={() => setRegenThumbConfirm(false)}
        title="Regenerate thumbnails?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRegenThumbConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setRegenThumbConfirm(false);
                api.regenerateThumbnails().catch(() => {});
              }}
            >
              Regenerate
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This deletes all cached thumbnails and regenerates them from the
          original files. Your photos are not affected.
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Thumbnails will appear as spinners until generation completes.
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
