import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PhotoSummary } from "../../lib/types";
import { PhotoCard } from "./PhotoCard";
import { useSelection } from "../../store/selection";
import { useUi } from "../../store/ui";

interface Props {
  photos: PhotoSummary[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

const MIN_CELL = 160;
const GAP = 8;

interface Marquee {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function PhotoGrid({
  photos,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);
  const selection = useSelection();
  const setDetailPhotoId = useUi((s) => s.setDetailPhotoId);

  // Responsive column count from container width.
  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth - 24; // account for padding
      const c = Math.max(2, Math.floor((w + GAP) / (MIN_CELL + GAP)));
      setCols(c);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.ceil(photos.length / cols);
  const cellSize = parentRef.current
    ? (parentRef.current.clientWidth - 24 - GAP * (cols - 1)) / cols
    : MIN_CELL;
  const rowHeight = cellSize + GAP;

  const estimateSize = useCallback(() => rowHeight, [rowHeight]);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 4,
  });

  // Infinite scroll: load more as the last row approaches.
  const virtualRows = rowVirtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1];
    if (!last) return;
    if (last.index >= rowCount - 2 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualRows, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const orderedIds = photos.map((p) => p.id);

  const onCardClick = useCallback(
    (id: number, e: React.MouseEvent) => {
      selection.handleClick(id, orderedIds, {
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
      });
    },
    // orderedIds derived from photos; selection is a stable store
    [photos] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---- Marquee drag-select ----
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    base: number[];
  } | null>(null);
  // Snapshot of visible card rects taken once at drag-start so hit-testing
  // on mousemove reads from a plain array instead of querying the DOM.
  const cardRectsRef = useRef<Array<{ id: number; rect: DOMRect }>>([]);

  const hitTest = useCallback((rect: Marquee) => {
    return cardRectsRef.current
      .filter(({ rect: r }) =>
        r.left < rect.x + rect.w &&
        r.right > rect.x &&
        r.top < rect.y + rect.h &&
        r.bottom > rect.y
      )
      .map(({ id }) => id);
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start a marquee from empty space (not when clicking a card).
      if ((e.target as HTMLElement).closest("[data-photo-id]")) return;
      if (e.button !== 0) return;
      // Snapshot card positions once so mousemove doesn't touch the DOM.
      const el = parentRef.current;
      if (el) {
        cardRectsRef.current = Array.from(
          el.querySelectorAll<HTMLElement>("[data-photo-id]")
        ).map((card) => ({
          id: Number(card.dataset.photoId),
          rect: card.getBoundingClientRect(),
        }));
      }
      const additive = e.ctrlKey || e.metaKey;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        base: additive ? selection.ids() : [],
      };
      if (!additive) selection.clear();
    },
    [selection]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rect: Marquee = {
        x: Math.min(drag.startX, e.clientX),
        y: Math.min(drag.startY, e.clientY),
        w: Math.abs(e.clientX - drag.startX),
        h: Math.abs(e.clientY - drag.startY),
      };
      if (rect.w < 4 && rect.h < 4) return; // ignore tiny jitters
      setMarquee(rect);
      const hits = hitTest(rect);
      useSelection.getState().selectExactly([...drag.base, ...hits]);
    };
    const onUp = () => {
      dragRef.current = null;
      setMarquee(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [hitTest]);

  return (
    <div
      ref={parentRef}
      onMouseDown={onMouseDown}
      className="scroll-area no-select relative h-full overflow-y-auto p-3"
    >
      <div
        style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}
      >
        {virtualRows.map((virtualRow) => {
          const start = virtualRow.index * cols;
          const rowPhotos = photos.slice(start, start + cols);
          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                height: rowHeight,
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: GAP,
              }}
            >
              {rowPhotos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  selected={selection.selected.has(photo.id)}
                  onClick={(e) => onCardClick(photo.id, e)}
                  onOpenDetail={() => setDetailPhotoId(photo.id)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {isFetchingNextPage && (
        <div className="py-4 text-center text-sm text-slate-400">Loading…</div>
      )}

      {marquee && (
        <div
          className="pointer-events-none fixed z-30 rounded border border-brand-400 bg-brand-400/15"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.w,
            height: marquee.h,
          }}
        />
      )}
    </div>
  );
}
