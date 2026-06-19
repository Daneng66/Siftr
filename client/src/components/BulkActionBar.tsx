import { Button } from "./ui/Modal";
import {
  FolderIcon,
  HeartIcon,
  PencilIcon,
  TagIcon,
  TextIcon,
  XIcon,
} from "./ui/icons";

interface Props {
  count: number;
  onTag: () => void;
  onRename: () => void;
  onMetadata: () => void;
  onOrganize: () => void;
  onFavorite: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  count,
  onTag,
  onRename,
  onMetadata,
  onOrganize,
  onFavorite,
  onClear,
}: Props) {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <span className="px-3 text-sm font-semibold tabular-nums">
          {count} selected
        </span>
        <div className="mx-0.5 h-6 w-px bg-slate-200 dark:bg-slate-700" />
        <Button variant="ghost" onClick={onFavorite}>
          <HeartIcon /> Favorite
        </Button>
        <Button variant="ghost" onClick={onTag}>
          <TagIcon /> Tag
        </Button>
        <Button variant="ghost" onClick={onRename}>
          <TextIcon /> Rename
        </Button>
        <Button variant="ghost" onClick={onMetadata}>
          <PencilIcon /> Metadata
        </Button>
        <Button variant="ghost" onClick={onOrganize}>
          <FolderIcon /> Organize
        </Button>
        <div className="mx-0.5 h-6 w-px bg-slate-200 dark:bg-slate-700" />
        <Button variant="ghost" onClick={onClear} aria-label="Clear selection">
          <XIcon />
        </Button>
      </div>
    </div>
  );
}
