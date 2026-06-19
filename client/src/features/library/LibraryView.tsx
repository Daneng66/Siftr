import { useMemo, useState } from "react";
import { useUi } from "../../store/ui";
import { useInfinitePhotos } from "../../hooks/queries";
import { useSelection } from "../../store/selection";
import { PhotoGrid } from "../../components/grid/PhotoGrid";
import { BulkActionBar } from "../../components/BulkActionBar";
import { RenameModal } from "../rename/RenameModal";
import { MetadataModal } from "../metadata/MetadataModal";
import { TagModal } from "../organize/TagModal";
import { OrganizeModal } from "../organize/OrganizeModal";
import type { FilterState } from "../../lib/types";
import { ImagesIcon } from "../../components/ui/icons";

const SORTS: { value: string; label: string }[] = [
  { value: "date_taken_desc", label: "Newest taken" },
  { value: "date_taken_asc", label: "Oldest taken" },
  { value: "imported_desc", label: "Recently imported" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "size_desc", label: "Largest files" },
];

function filterTitle(f: FilterState): string {
  switch (f.kind) {
    case "unfiled":
      return "Unfiled";
    case "duplicates":
      return "In duplicate groups";
    case "folder":
      return f.name;
    case "tag":
      return `#${f.name}`;
    default:
      return "All photos";
  }
}

type ModalKind = "tag" | "rename" | "metadata" | "organize" | null;

export function LibraryView() {
  const { filter, sort, setSort, search } = useUi();
  const selection = useSelection();
  const [modal, setModal] = useState<ModalKind>(null);

  const query = useInfinitePhotos(filter, sort, search);
  const photos = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  );
  const total = query.data?.pages[0]?.total ?? 0;
  const selectedIds = selection.ids();

  return (
    <div className="flex h-full flex-col">
      {/* Context / toolbar bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-lg font-semibold">{filterTitle(filter)}</h1>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 tabular-nums dark:bg-slate-800">
          {total}
        </span>
        <div className="flex-1" />
        {photos.length > 0 && (
          <button
            onClick={() => selection.selectExactly(photos.map((p) => p.id))}
            className="text-sm text-brand-600 hover:underline"
          >
            Select all loaded
          </button>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {query.isLoading ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            Loading…
          </div>
        ) : photos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <ImagesIcon className="mb-3 text-4xl text-slate-300" />
            <p className="font-medium">No photos here yet</p>
            <p className="max-w-sm text-sm text-slate-500">
              Drop images into the mounted <code>/data/photos</code> folder and
              press <strong>Scan</strong> to index your library.
            </p>
          </div>
        ) : (
          <PhotoGrid
            photos={photos}
            hasNextPage={!!query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            fetchNextPage={query.fetchNextPage}
          />
        )}
      </div>

      <BulkActionBar
        count={selection.count()}
        onTag={() => setModal("tag")}
        onRename={() => setModal("rename")}
        onMetadata={() => setModal("metadata")}
        onOrganize={() => setModal("organize")}
        onClear={() => selection.clear()}
      />

      <TagModal
        open={modal === "tag"}
        onClose={() => setModal(null)}
        photoIds={selectedIds}
      />
      <RenameModal
        open={modal === "rename"}
        onClose={() => setModal(null)}
        photoIds={selectedIds}
      />
      <MetadataModal
        open={modal === "metadata"}
        onClose={() => setModal(null)}
        photoIds={selectedIds}
      />
      <OrganizeModal
        open={modal === "organize"}
        onClose={() => setModal(null)}
        photoIds={selectedIds}
      />
    </div>
  );
}
