import { useMemo } from "react";
import { useFolders, useHardScanRunning, useStats } from "../../hooks/queries";
import { useUi } from "../../store/ui";
import { formatBytes } from "../../lib/format";
import type { FilterState, Folder } from "../../lib/types";
import { FolderIcon, ImagesIcon, CopyIcon, ChatIcon, MoonIcon, SunIcon, XIcon } from "../ui/icons";
import { clsx } from "clsx";

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function filtersEqual(a: FilterState, b: FilterState): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "folder" && b.kind === "folder") return a.path === b.path;
  return true;
}

function FilterButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      )}
    >
      <span className="text-base text-slate-400">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-slate-400 tabular-nums">{count}</span>
      )}
    </button>
  );
}

interface FolderNode extends Folder {
  children: FolderNode[];
}

function buildTree(folders: Folder[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  folders.forEach((f) => map.set(f.path, { ...f, children: [] }));
  const roots: FolderNode[] = [];
  map.forEach((node) => {
    if (node.parent_path && map.has(node.parent_path))
      map.get(node.parent_path)!.children.push(node);
    else roots.push(node);
  });
  return roots;
}

function FolderTree({ nodes, depth = 0 }: { nodes: FolderNode[]; depth?: number }) {
  const { filter, setFilter, setSidebarOpen } = useUi();
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <button
            onClick={() => {
              setFilter({ kind: "folder", path: node.path, name: node.name });
              setSidebarOpen(false);
            }}
            style={{ paddingLeft: `${0.625 + depth * 0.85}rem` }}
            className={clsx(
              "flex w-full items-center gap-2 rounded-lg py-1.5 pr-2.5 text-sm transition-colors",
              filter.kind === "folder" && filter.path === node.path
                ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            <FolderIcon className="text-base text-amber-500" />
            <span className="flex-1 truncate text-left">{node.name}</span>
            <span className="text-xs text-slate-400 tabular-nums">
              {node.photo_count}
            </span>
          </button>
          {node.children.length > 0 && (
            <FolderTree nodes={node.children} depth={depth + 1} />
          )}
        </div>
      ))}
    </>
  );
}

export function Sidebar() {
  const { filter, setFilter, setView, sidebarOpen, setSidebarOpen, theme, toggleTheme } = useUi();
  const { data: stats } = useStats();
  const { data: foldersData } = useFolders();
  const hardScanRunning = useHardScanRunning();

  // During a hard scan the index is wiped and rebuilt, but the stats query holds
  // its last (now stale) values since it stops polling. Treat stats as empty so
  // the sidebar shows zeroed totals and cleared counts rather than pre-wipe ones.
  const liveStats = hardScanRunning ? undefined : stats;

  const tree = useMemo(
    () => buildTree(foldersData?.folders ?? []),
    [foldersData]
  );

  const select = (f: FilterState) => {
    setFilter(f);
    setView("library");
    setSidebarOpen(false);
  };

  return (
    <aside
      className={clsx(
        "scroll-area flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900",
        // Mobile: fixed overlay with slide-in transition
        "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex items-center justify-between md:hidden">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Menu</span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <SunIcon className="text-base" /> : <MoonIcon className="text-base" />}
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close sidebar"
          >
            <XIcon className="text-base" />
          </button>
        </div>
      </div>

      <section className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Library
        </h3>
        <div className="space-y-1">
          <StatRow label="Photos" value={liveStats?.photos ?? 0} />
          <StatRow label="Total size" value={formatBytes(liveStats?.totalSize ?? 0)} />
          <StatRow label="Duplicates" value={liveStats?.duplicateCount ?? 0} />
          <StatRow
            label="Reclaimable"
            value={formatBytes(liveStats?.reclaimableSize ?? 0)}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Filters
        </h3>
        <div className="space-y-0.5">
          <FilterButton
            active={filtersEqual(filter, { kind: "all" })}
            onClick={() => select({ kind: "all" })}
            icon={<ImagesIcon />}
            label="All photos"
            count={liveStats?.photos}
          />
          <FilterButton
            active={filtersEqual(filter, { kind: "duplicates" })}
            onClick={() => select({ kind: "duplicates" })}
            icon={<CopyIcon />}
            label="In duplicate groups"
          />
        </div>
      </section>

      <section>
        <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Folders
        </h3>
        {tree.length === 0 ? (
          <p className="px-2.5 text-xs text-slate-400">
            No subfolders. Folders mirror the directory structure of your photos
            on disk.
          </p>
        ) : (
          <div className="space-y-0.5">
            <FolderTree nodes={tree} />
          </div>
        )}
      </section>

      <a
        href="https://github.com/Daneng66/Siftr/discussions"
        target="_blank"
        rel="noreferrer"
        className="mt-auto flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <ChatIcon className="text-base text-slate-400" />
        <span className="flex-1 text-left">Feedback &amp; requests</span>
      </a>
    </aside>
  );
}
