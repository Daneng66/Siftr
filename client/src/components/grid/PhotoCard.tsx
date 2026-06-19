import { memo } from "react";
import type { PhotoSummary } from "../../lib/types";
import { api } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { clsx } from "clsx";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  HeartIcon,
  TagIcon,
} from "../ui/icons";

interface Props {
  photo: PhotoSummary;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onOpenDetail: () => void;
  onToggleFavorite: () => void;
}

function PhotoCardImpl({
  photo,
  selected,
  onClick,
  onOpenDetail,
  onToggleFavorite,
}: Props) {
  return (
    <div
      data-photo-id={photo.id}
      onClick={onClick}
      onDoubleClick={onOpenDetail}
      className={clsx(
        "group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-slate-200 ring-2 transition-all dark:bg-slate-800",
        selected
          ? "ring-brand-500"
          : "ring-transparent hover:ring-slate-300 dark:hover:ring-slate-600"
      )}
    >
      {photo.thumbnail_path ? (
        <img
          src={api.thumbnailUrl(photo.id)}
          alt={photo.current_filename}
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
          no preview
        </div>
      )}

      {/* Gradient + filename on hover */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="truncate text-xs font-medium text-white">
          {photo.current_filename}
        </p>
      </div>

      {/* Top-left badges */}
      <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
        {photo.dup_count > 0 && (
          <span
            className="inline-flex items-center gap-0.5 rounded bg-amber-500/90 px-1.5 py-0.5 text-[0.65rem] font-semibold text-white"
            title="In a duplicate group"
          >
            <CopyIcon className="text-[0.7rem]" /> dup
          </span>
        )}
        {photo.tag_count > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5 text-[0.65rem] font-medium text-white">
            <TagIcon className="text-[0.7rem]" /> {photo.tag_count}
          </span>
        )}
      </div>

      {/* File-size badge bottom-right (hidden on hover to avoid clashing) */}
      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[0.65rem] font-medium text-white opacity-100 transition-opacity group-hover:opacity-0">
        {formatBytes(photo.file_size)}
      </span>

      {/* Selection checkmark */}
      <div
        className={clsx(
          "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all",
          selected
            ? "border-brand-500 bg-brand-500 text-white"
            : "border-white/80 bg-black/30 text-transparent opacity-0 group-hover:opacity-100"
        )}
      >
        <CheckIcon className="text-xs" />
      </div>

      {/* Hover quick actions */}
      <div className="absolute inset-x-0 top-0 flex justify-center gap-1.5 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title="Favorite"
          className={clsx(
            "rounded-full bg-black/45 p-1.5 text-white backdrop-blur hover:bg-black/65",
            photo.is_favorite && "text-rose-400"
          )}
        >
          <HeartIcon filled={!!photo.is_favorite} className="text-sm" />
        </button>
        <a
          href={api.rawUrl(photo.id, true)}
          onClick={(e) => e.stopPropagation()}
          title="Download"
          className="rounded-full bg-black/45 p-1.5 text-white backdrop-blur hover:bg-black/65"
        >
          <DownloadIcon className="text-sm" />
        </a>
      </div>
    </div>
  );
}

export const PhotoCard = memo(PhotoCardImpl);
