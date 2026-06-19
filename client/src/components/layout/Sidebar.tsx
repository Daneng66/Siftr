import { useMemo, useState } from "react";
import { useFolders, useStats, useTags } from "../../hooks/queries";
import { useUi } from "../../store/ui";
import { formatBytes } from "../../lib/format";
import type { FilterState, Folder } from "../../lib/types";
import { FolderIcon, ImagesIcon, CopyIcon, TagIcon } from "../ui/icons";
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
  if ((a.kind === "folder" || a.kind === "tag") && (b.kind === "folder" || b.kind === "tag"))
    return a.id === b.id;
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
  const map = new Map<number, FolderNode>();
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const roots: FolderNode[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id))
      map.get(node.parent_id)!.children.push(node);
    else roots.push(node);
  });
  return roots;
}

function FolderTree({ nodes, depth = 0 }: { nodes: FolderNode[]; depth?: number }) {
  const { filter, setFilter } = useUi();
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <button
            onClick={() =>
              setFilter({ kind: "folder", id: node.id, name: node.name })
            }
            style={{ paddingLeft: `${0.625 + depth * 0.85}rem` }}
            className={clsx(
              "flex w-full items-center gap-2 rounded-lg py-1.5 pr-2.5 text-sm transition-colors",
              filter.kind === "folder" && filter.id === node.id
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
  const { filter, setFilter, setView } = useUi();
  const { data: stats } = useStats();
  const { data: foldersData } = useFolders();
  const { data: tagsData } = useTags();
  const [showAllTags, setShowAllTags] = useState(false);

  const tree = useMemo(
    () => buildTree(foldersData?.folders ?? []),
    [foldersData]
  );
  const tags = tagsData?.tags ?? [];
  const visibleTags = showAllTags ? tags : tags.slice(0, 8);

  const select = (f: FilterState) => {
    setFilter(f);
    setView("library");
  };

  return (
    <aside className="scroll-area flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900">
      <section className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Library
        </h3>
        <div className="space-y-1">
          <StatRow label="Photos" value={stats?.photos ?? 0} />
          <StatRow label="Total size" value={formatBytes(stats?.totalSize ?? 0)} />
          <StatRow label="Duplicate groups" value={stats?.duplicateGroups ?? 0} />
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
            count={stats?.photos}
          />
          <FilterButton
            active={filtersEqual(filter, { kind: "unfiled" })}
            onClick={() => select({ kind: "unfiled" })}
            icon={<FolderIcon />}
            label="Unfiled"
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
            No folders yet. Use bulk actions or auto-organize to create them.
          </p>
        ) : (
          <div className="space-y-0.5">
            <FolderTree nodes={tree} />
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Tags
        </h3>
        {tags.length === 0 ? (
          <p className="px-2.5 text-xs text-slate-400">No tags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 px-1">
            {visibleTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => select({ kind: "tag", id: tag.id, name: tag.name })}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors",
                  filter.kind === "tag" && filter.id === tag.id
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                )}
              >
                <TagIcon className="text-[0.7rem]" />
                {tag.name}
                <span className="opacity-60">{tag.photo_count}</span>
              </button>
            ))}
            {tags.length > 8 && (
              <button
                onClick={() => setShowAllTags((v) => !v)}
                className="px-2 py-1 text-xs text-brand-600 hover:underline"
              >
                {showAllTags ? "Show less" : `+${tags.length - 8} more`}
              </button>
            )}
          </div>
        )}
      </section>
    </aside>
  );
}
