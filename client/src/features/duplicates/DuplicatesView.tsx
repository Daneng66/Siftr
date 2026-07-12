import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  useDuplicates,
  useInvalidateLibrary,
  useJobsSnapshot,
} from "../../hooks/queries";
import { useUi } from "../../store/ui";
import { Button, Modal } from "../../components/ui/Modal";
import { formatBytes } from "../../lib/format";
import { CheckIcon, CopyIcon, ScanIcon, SpinnerIcon, StarIcon, TrashIcon, XIcon } from "../../components/ui/icons";
import type { DuplicateGroup, DupStatus } from "../../lib/types";
import { findPatternMatches } from "../../lib/namePattern";
import { parseExtensionPriority, pickPreferredByExtension } from "../../lib/extensionPriority";
import { clsx } from "clsx";

function GroupCard({
  group,
  nameMatches,
  extRecommendedId,
  onStatusChange,
}: {
  group: DuplicateGroup;
  nameMatches?: Set<number>;
  extRecommendedId?: number | null;
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

  // Which member currently holds the default "recommended" slot, if any (once a
  // group is resolved via keepOnly/ignoreAll, no member has this status anymore).
  const liveRecommendedId = group.members.find(
    (m) => status[m.photo_id] === "recommended"
  )?.photo_id;
  // Extension priority can redirect the recommendation to a different member,
  // but only while the group is still in its untouched default state.
  const effectiveRecommendedId =
    liveRecommendedId !== undefined ? extRecommendedId ?? liveRecommendedId : undefined;

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
            {busy ? <SpinnerIcon className="animate-spin" /> : <TrashIcon />}
            {busy ? "Deleting…" : `Delete ${markedCount || ""}`}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {group.members.map((m) => {
          const st = status[m.photo_id];
          const recommended =
            effectiveRecommendedId !== undefined &&
            m.photo_id === effectiveRecommendedId &&
            st !== "kept" &&
            st !== "marked_for_deletion";
          return (
            <div
              key={m.photo_id}
              className={clsx(
                "w-full overflow-hidden rounded-lg border-2 transition-colors sm:w-48",
                st === "kept" && "border-emerald-500",
                recommended && "border-amber-500",
                st === "marked_for_deletion" && "border-red-500 opacity-70",
                !recommended && st !== "kept" && st !== "marked_for_deletion" && "border-transparent"
              )}
            >
              <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
                <img
                  src={api.thumbnailUrl(m.photo_id, m.mtime_ms)}
                  alt={m.current_filename}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {st === "kept" && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-emerald-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                    <CheckIcon /> Keep
                  </span>
                )}
                {recommended && (
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
                  {nameMatches?.has(m.photo_id) && (
                    <span
                      className="ml-1 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                      title="Filename matches the name pattern"
                    >
                      name match
                    </span>
                  )}
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
  const { filter, setFilter } = useUi();
  const invalidate = useInvalidateLibrary();
  const { data: jobsData } = useJobsSnapshot();
  const dedupRunning = jobsData?.dedupRunning ?? false;
  const hardScanRunning = jobsData?.hardScanRunning ?? false;
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Which deletion is in flight, so the matching button shows a spinner.
  const [deletingMode, setDeletingMode] = useState<null | "trash" | "permanent">(null);
  const [permDeleteArmed, setPermDeleteArmed] = useState(false);
  const permDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live status overrides from GroupCard optimistic updates, keyed by group id.
  const [localStatuses, setLocalStatuses] = useState<Record<number, Record<number, DupStatus>>>({});
  // Targeted-dedup filters: restrict/steer the groups shown. The folder filter
  // is the same sidebar folder-tree selection the Library view uses (shared
  // global state), so clicking a folder there also scopes this view.
  const [namePattern, setNamePattern] = useState("{name}_{d}.{ext}");
  const [nameFilterOn, setNameFilterOn] = useState(false);
  const [extPriorityInput, setExtPriorityInput] = useState("");

  // Refresh groups whenever a dedup run completes.
  useEffect(() => {
    if (!dedupRunning) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dedupRunning]);

  const allGroups = data?.groups ?? [];
  const activeFolder = filter.kind === "folder" ? filter : null;
  const extPriorityList = useMemo(() => parseExtensionPriority(extPriorityInput), [extPriorityInput]);

  // Precompute name-pattern matches per group so both the filter and the
  // per-member badges use the same result.
  const nameMatchesByGroup = useMemo(() => {
    const map = new Map<number, Set<number>>();
    if (!nameFilterOn && !namePattern.trim()) return map;
    for (const g of allGroups) {
      map.set(
        g.id,
        findPatternMatches(
          g.members.map((m) => ({ id: m.photo_id, filename: m.current_filename })),
          namePattern
        )
      );
    }
    return map;
  }, [allGroups, namePattern, nameFilterOn]);

  // Precompute the extension-priority pick per group so both "Keep all
  // recommended" and the per-member "Recommended" badge use the same result.
  const extRecommendedByGroup = useMemo(() => {
    const map = new Map<number, number | null>();
    if (extPriorityList.length === 0) return map;
    for (const g of allGroups) {
      map.set(
        g.id,
        pickPreferredByExtension(
          g.members.map((m) => ({ id: m.photo_id, filename: m.current_filename })),
          extPriorityList
        )
      );
    }
    return map;
  }, [allGroups, extPriorityList]);

  const groups = allGroups.filter((g) => {
    if (activeFolder && !g.members.some((m) => m.rel_dir === activeFolder.path)) return false;
    if (nameFilterOn && (nameMatchesByGroup.get(g.id)?.size ?? 0) === 0) return false;
    return true;
  });
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
          // Extension priority (if set) wins over the server's largest-file
          // pick; promote the winner to kept, mark the rest for deletion.
          const extPick = extRecommendedByGroup.get(group.id);
          const recommended = group.members.find((m) => m.status === "recommended");
          const best =
            (extPick != null ? group.members.find((m) => m.photo_id === extPick) : undefined) ??
            recommended ??
            [...group.members].sort((a, b) => b.file_size - a.file_size)[0];
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
    // Keep the confirmation modal open with a spinner until the delete lands.
    setDeletingMode(permanent ? "permanent" : "trash");
    try {
      // Scope to the currently filtered groups so an active folder/name-pattern
      // filter can't cause the confirm dialog to undercount what's deleted.
      const filtered = !!activeFolder || nameFilterOn;
      if (filtered) {
        await Promise.all(groups.map((g) => api.applyDuplicates(g.id, permanent)));
      } else {
        await api.applyDuplicates(undefined, permanent);
      }
      setLocalStatuses({});
      invalidate();
      refetch();
      closeDeleteConfirm();
    } finally {
      setDeletingMode(null);
    }
  };

  const closeDeleteConfirm = () => {
    if (deletingMode) return; // don't let a backdrop/Esc close mid-delete
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
    <div className="scroll-area h-full overflow-y-auto p-3 sm:p-5">
      <div className="mb-5">
        <h1 className="text-xl font-bold">Duplicates</h1>
        <p className="text-sm text-slate-500">
          Exact (hash-based) duplicate groups found by czkawka. Pick which copy
          to keep. Scans run with the main library scan, or on demand from the
          Scan menu.
        </p>
      </div>

      {/* Targeted-dedup filters — restrict/steer which groups are shown/acted on.
          Folder scoping comes from the sidebar's folder tree (shared global
          filter state), so browse there rather than a separate picker here. */}
      {allGroups.length > 0 && !isLoading && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4 dark:border-slate-700 dark:bg-slate-800/50">
          {activeFolder && (
            <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              Folder: {activeFolder.name}
              <button
                type="button"
                onClick={() => setFilter({ kind: "all" })}
                aria-label="Clear folder filter"
                className="rounded hover:opacity-70"
              >
                <XIcon className="text-xs" />
              </button>
            </span>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Name pattern</span>
            <input
              type="text"
              value={namePattern}
              onChange={(e) => setNamePattern(e.target.value)}
              placeholder="{name}_{d}.{ext}"
              title={
                "Tokens: {name} base name, {ext} extension (both required), " +
                "{d} digits, * any characters, ? single character"
              }
              className="w-48 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={nameFilterOn}
              onChange={(e) => setNameFilterOn(e.target.checked)}
            />
            Only show name-pattern matches
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Extension priority</span>
            <input
              type="text"
              value={extPriorityInput}
              onChange={(e) => setExtPriorityInput(e.target.value)}
              placeholder="heic, raw, jpg"
              title="Comma-separated extensions, highest priority first. The best-ranked copy in each group is recommended to keep, overriding the largest-file default."
              className="w-40 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>
          {(activeFolder || nameFilterOn || extPriorityInput.trim()) && (
            <button
              type="button"
              onClick={() => {
                if (activeFolder) setFilter({ kind: "all" });
                setNameFilterOn(false);
                setExtPriorityInput("");
              }}
              className="pb-1.5 text-sm text-brand-600 hover:underline dark:text-brand-400"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Bulk actions — only shown when there are groups to act on */}
      {groups.length > 0 && !isLoading && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:px-4 sm:py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
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
            disabled={bulkBusy || dedupRunning || totalMarked === 0 || deletingMode !== null}
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
        allGroups.length === 0 && (
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
      ) : isLoading || ((isFetching || dedupRunning) && allGroups.length === 0) ? (
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
      ) : allGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <CopyIcon className="mx-auto mb-2 text-3xl text-slate-300" />
          <p className="font-medium">No duplicate groups</p>
          <p className="text-sm text-slate-500">
            Run a duplicate scan to find exact (hash-based) duplicate photos.
          </p>
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <CopyIcon className="mx-auto mb-2 text-3xl text-slate-300" />
          <p className="font-medium">No groups match your filters</p>
          <p className="text-sm text-slate-500">
            Try a different folder (via the sidebar) or adjust the name pattern.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              nameMatches={nameMatchesByGroup.get(g.id)}
              extRecommendedId={extRecommendedByGroup.get(g.id)}
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
            <Button
              variant="ghost"
              onClick={closeDeleteConfirm}
              disabled={deletingMode !== null}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => bulkDelete(false)}
              disabled={deletingMode !== null}
            >
              {deletingMode === "trash" ? (
                <SpinnerIcon className="animate-spin" />
              ) : (
                <TrashIcon />
              )}
              {deletingMode === "trash" ? "Moving…" : "Move to trash"}
            </Button>
            <button
              onClick={handlePermDeleteClick}
              disabled={deletingMode !== null}
              className={clsx(
                "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50",
                permDeleteArmed
                  ? "bg-orange-600 text-white hover:bg-orange-700"
                  : "bg-red-600 text-white hover:bg-red-700"
              )}
            >
              {deletingMode === "permanent" ? (
                <SpinnerIcon className="animate-spin" />
              ) : (
                <TrashIcon />
              )}
              {deletingMode === "permanent"
                ? "Deleting…"
                : permDeleteArmed
                  ? "Are you sure?"
                  : "Delete permanently"}
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
