import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  useDuplicates,
  useInvalidateLibrary,
  useJobs,
} from "../../hooks/queries";
import { Button } from "../../components/ui/Modal";
import { formatBytes } from "../../lib/format";
import { CheckIcon, CopyIcon, ScanIcon, TrashIcon } from "../../components/ui/icons";
import type { DuplicateGroup, DupStatus } from "../../lib/types";
import { clsx } from "clsx";

function GroupCard({ group }: { group: DuplicateGroup }) {
  const invalidate = useInvalidateLibrary();
  // Local status map seeded from the server, edited optimistically.
  const [status, setStatus] = useState<Record<number, DupStatus>>(() =>
    Object.fromEntries(group.members.map((m) => [m.photo_id, m.status]))
  );
  const [busy, setBusy] = useState(false);

  const push = async (next: Record<number, DupStatus>) => {
    setStatus(next);
    await api
      .resolveGroup(
        group.id,
        group.members.map((m) => ({ photoId: m.photo_id, status: next[m.photo_id] }))
      )
      .catch(() => {});
  };

  const keepOnly = (photoId: number) => {
    const next: Record<number, DupStatus> = {};
    for (const m of group.members)
      next[m.photo_id] = m.photo_id === photoId ? "kept" : "marked_for_deletion";
    push(next);
  };

  const toggleDelete = (photoId: number) => {
    const next = { ...status };
    next[photoId] =
      next[photoId] === "marked_for_deletion" ? "ignored" : "marked_for_deletion";
    push(next);
  };

  const ignoreAll = () => {
    push(Object.fromEntries(group.members.map((m) => [m.photo_id, "ignored"])));
  };

  const markedCount = Object.values(status).filter(
    (s) => s === "marked_for_deletion"
  ).length;

  const applyGroup = async () => {
    setBusy(true);
    try {
      await api.applyDuplicates(group.id);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              group.kind === "exact"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
            )}
          >
            <CopyIcon /> {group.kind}
          </span>
          <span className="text-slate-500">{group.members.length} copies</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={ignoreAll}>
            Ignore group
          </Button>
          <Button
            variant="danger"
            disabled={busy || markedCount === 0}
            onClick={applyGroup}
          >
            <TrashIcon /> Delete {markedCount || ""}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {group.members.map((m) => {
          const st = status[m.photo_id];
          return (
            <div
              key={m.photo_id}
              className={clsx(
                "w-48 overflow-hidden rounded-lg border-2 transition-colors",
                st === "kept" && "border-emerald-500",
                st === "marked_for_deletion" && "border-red-500 opacity-70",
                st === "ignored" && "border-transparent"
              )}
            >
              <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
                <img
                  src={api.thumbnailUrl(m.photo_id)}
                  alt={m.current_filename}
                  className="h-full w-full object-cover"
                />
                {st === "kept" && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-emerald-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                    <CheckIcon /> Keep
                  </span>
                )}
                {st === "marked_for_deletion" && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                    <TrashIcon /> Delete
                  </span>
                )}
                {m.similarity && (
                  <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                    {m.similarity}
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium" title={m.path}>
                  {m.current_filename}
                </p>
                <p className="text-xs text-slate-400">
                  {formatBytes(m.file_size)}
                  {m.width ? ` · ${m.width}×${m.height}` : ""}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => keepOnly(m.photo_id)}
                    className="flex-1 rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300"
                  >
                    Keep this
                  </button>
                  <button
                    onClick={() => toggleDelete(m.photo_id)}
                    className="flex-1 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
                  >
                    {st === "marked_for_deletion" ? "Unmark" : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DuplicatesView() {
  const { data, refetch, isLoading } = useDuplicates();
  const { data: jobsData } = useJobs(true);
  const dedupRunning = jobsData?.dedupRunning ?? false;

  // Refresh groups when a dedup run completes.
  useEffect(() => {
    if (!dedupRunning) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dedupRunning]);

  const groups = data?.groups ?? [];
  const latestDedup = jobsData?.jobs.find((j) => j.type === "dedup");

  return (
    <div className="scroll-area h-full overflow-y-auto p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Duplicates</h1>
          <p className="text-sm text-slate-500">
            Exact (hash-based) duplicate groups found by czkawka. Pick which copy
            to keep.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={dedupRunning}
          onClick={() => api.startDedup().catch(() => {})}
        >
          <ScanIcon className={dedupRunning ? "animate-spin" : ""} />
          {dedupRunning ? "Scanning…" : "Scan for duplicates"}
        </Button>
      </div>

      {/* Surface scan status/failures so the button never silently "does nothing". */}
      {dedupRunning && (
        <div className="mb-4 rounded-lg bg-brand-50 px-4 py-2.5 text-sm text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
          Scanning for duplicates… {latestDedup?.message || ""}
        </div>
      )}
      {!dedupRunning && latestDedup?.status === "failed" && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <span className="font-medium">Duplicate scan failed:</span>{" "}
          {latestDedup.error || "unknown error"}
        </div>
      )}
      {!dedupRunning &&
        latestDedup?.status === "completed" &&
        groups.length === 0 && (
          <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            Scan complete — no duplicate groups found.
          </div>
        )}

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <CopyIcon className="mx-auto mb-2 text-3xl text-slate-300" />
          <p className="font-medium">No duplicate groups</p>
          <p className="text-sm text-slate-500">
            Run a duplicate scan to find exact (hash-based) duplicate photos.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
