import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  useDuplicates,
  useInvalidateLibrary,
  useJobsSnapshot,
} from "../../hooks/queries";
import { Button, Modal } from "../../components/ui/Modal";
import { formatBytes } from "../../lib/format";
import { CheckIcon, CopyIcon, ScanIcon, StarIcon, TrashIcon } from "../../components/ui/icons";
import type { DuplicateGroup, DupStatus } from "../../lib/types";
import { clsx } from "clsx";

function GroupCard({
  group,
  onStatusChange,
}: {
  group: DuplicateGroup;
  onStatusChange?: (status: Record<number, DupStatus>) => void;
}) {
  const invalidate = useInvalidateLibrary();
  // Local status map seeded from the server, edited optimistically.
  const [status, setStatus] = useState<Record<number, DupStatus>>(() =>
    Object.fromEntries(group.members.map((m) => [m.photo_id, m.status]))
  );
  const [busy, setBusy] = useState(false);

  // Re-sync when server data changes (e.g. after "Keep all recommended").
  useEffect(() => {
    setStatus(Object.fromEntries(group.members.map((m) => [m.photo_id, m.status])));
  }, [group]);

  const push = async (next: Record<number, DupStatus>) => {
    setStatus(next);
    onStatusChange?.(next);
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
                st === "recommended" && "border-amber-500",
                st === "marked_for_deletion" && "border-red-500 opacity-70",
                st === "ignored" && "border-transparent"
              )}
            >
              <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
                <img
                  src={api.thumbnailUrl(m.photo_id)}
                  alt={m.current_filename}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {st === "kept" && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-emerald-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                    <CheckIcon /> Keep
                  </span>
                )}
                {st === "recommended" && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                    <StarIcon /> Recommended
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
  const { data, refetch, isLoading, isFetching } = useDuplicates();
  const invalidate = useInvalidateLibrary();
  const { data: jobsData } = useJobsSnapshot();
  const dedupRunning = jobsData?.dedupRunning ?? false;
  const hardScanRunning = jobsData?.hardScanRunning ?? false;
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [permDeleteArmed, setPermDeleteArmed] = useState(false);
  const permDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live status overrides from GroupCard optimistic updates, keyed by group id.
  const [localStatuses, setLocalStatuses] = useState<Record<number, Record<number, DupStatus>>>({});

  // Refresh groups whenever a dedup run completes.
  useEffect(() => {
    if (!dedupRunning) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dedupRunning]);

  const groups = data?.groups ?? [];
  const latestDedup = jobsData?.jobs.find((j) => j.type === "dedup");

  // Aggregate deletion stats, preferring live local state over stale server data.
  const markedMembers = groups.flatMap((g) =>
    g.members.filter((m) => {
      const live = localStatuses[g.id];
      return (live ? live[m.photo_id] : m.status) === "marked_for_deletion";
    })
  );
  const totalMarked = markedMembers.length;
  const totalMarkedSize = markedMembers.reduce((sum, m) => sum + m.file_size, 0);

  const keepAllRecommended = async () => {
    setBulkBusy(true);
    try {
      await Promise.all(
        groups.map((group) => {
          // Promote the recommended member to kept; mark the rest for deletion.
          const recommended = group.members.find((m) => m.status === "recommended");
          const best = recommended ?? [...group.members].sort((a, b) => b.file_size - a.file_size)[0];
          return api.resolveGroup(
            group.id,
            group.members.map((m) => ({
              photoId: m.photo_id,
              status: (m.photo_id === best.photo_id ? "kept" : "marked_for_deletion") as DupStatus,
            }))
          );
        })
      );
      setLocalStatuses({});
      refetch();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async (permanent = false) => {
    setBulkBusy(true);
    setShowDeleteConfirm(false);
    try {
      await api.applyDuplicates(undefined, permanent);
      setLocalStatuses({});
      invalidate();
      refetch();
    } finally {
      setBulkBusy(false);
    }
  };

  const closeDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setPermDeleteArmed(false);
    if (permDeleteTimer.current) clearTimeout(permDeleteTimer.current);
  };

  const handlePermDeleteClick = () => {
    if (!permDeleteArmed) {
      setPermDeleteArmed(true);
      permDeleteTimer.current = setTimeout(() => setPermDeleteArmed(false), 3000);
    } else {
      if (permDeleteTimer.current) clearTimeout(permDeleteTimer.current);
      setPermDeleteArmed(false);
      bulkDelete(true);
    }
  };

  return (
    <div className="scroll-area h-full overflow-y-auto p-5">
      <div className="mb-5">
        <h1 className="text-xl font-bold">Duplicates</h1>
        <p className="text-sm text-slate-500">
          Exact (hash-based) duplicate groups found by czkawka. Pick which copy
          to keep. Scans run with the main library scan, or on demand from the
          Scan menu.
        </p>
      </div>

      {/* Bulk actions — only shown when there are groups to act on */}
      {groups.length > 0 && !isLoading && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
          <span className="mr-auto text-sm font-medium text-slate-600 dark:text-slate-300">
            Bulk actions
          </span>
          <Button
            variant="default"
            disabled={bulkBusy || dedupRunning}
            onClick={keepAllRecommended}
          >
            <CheckIcon /> Keep all recommended
          </Button>
          <Button
            variant="danger"
            disabled={bulkBusy || dedupRunning || totalMarked === 0}
            onClick={() => setShowDeleteConfirm(true)}
          >
            <TrashIcon /> Delete {totalMarked > 0 ? `${totalMarked} selected` : "selected"}
            {totalMarked > 0 && (
              <span className="ml-1 opacity-75">({formatBytes(totalMarkedSize)})</span>
            )}
          </Button>
        </div>
      )}

      {/* Surface scan status/failures so a run never silently "does nothing".
          When there are no groups yet, the centered status below owns this state;
          this thin banner is just the "rescanning in the background" indicator
          shown above the existing groups. */}
      {dedupRunning && groups.length > 0 && (
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
        !isFetching &&
        latestDedup?.status === "completed" &&
        groups.length === 0 && (
          <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            Scan complete — no duplicate groups found.
          </div>
        )}

      {hardScanRunning ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <CopyIcon className="mx-auto mb-2 text-3xl text-slate-300" />
          <p className="font-medium">Rebuilding library…</p>
          <p className="text-sm text-slate-500">
            A hard scan is re-indexing your photos. Duplicate groups will appear
            once it finishes.
          </p>
        </div>
      ) : isLoading || ((isFetching || dedupRunning) && groups.length === 0) ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <ScanIcon className="mb-2 animate-spin text-3xl text-brand-500" />
          <p className="font-medium">
            {dedupRunning ? "Scanning for duplicates…" : "Loading duplicates…"}
          </p>
          <p className="text-sm text-slate-500">
            {dedupRunning
              ? latestDedup?.message || "Comparing files for exact duplicates."
              : "Fetching duplicate groups."}
          </p>
        </div>
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
            <GroupCard
              key={g.id}
              group={g}
              onStatusChange={(s) =>
                setLocalStatuses((prev) => ({ ...prev, [g.id]: s }))
              }
            />
          ))}
        </div>
      )}

      {/* Bulk delete confirmation */}
      <Modal
        open={showDeleteConfirm}
        onClose={closeDeleteConfirm}
        title="Remove selected duplicates"
        footer={
          <>
            <Button variant="ghost" onClick={closeDeleteConfirm}>
              Cancel
            </Button>
            <Button variant="default" onClick={() => bulkDelete(false)}>
              <TrashIcon /> Move to trash
            </Button>
            <button
              onClick={handlePermDeleteClick}
              className={clsx(
                "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                permDeleteArmed
                  ? "bg-orange-600 text-white hover:bg-orange-700"
                  : "bg-red-600 text-white hover:bg-red-700"
              )}
            >
              <TrashIcon />
              {permDeleteArmed ? "Are you sure?" : "Delete permanently"}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          <span className="font-semibold">
            {totalMarked} {totalMarked === 1 ? "photo" : "photos"}
          </span>{" "}
          will be removed, freeing{" "}
          <span className="font-semibold">{formatBytes(totalMarkedSize)}</span>.
          "Move to trash" places them in the{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">.trash</code> folder
          and can be recovered manually. "Delete permanently" is irreversible.
        </p>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
          {markedMembers.map((m) => (
            <div
              key={m.photo_id}
              className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-0 dark:border-slate-800"
            >
              <span className="truncate font-medium" title={m.path}>
                {m.current_filename}
              </span>
              <span className="ml-3 shrink-0 text-slate-400">
                {formatBytes(m.file_size)}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
