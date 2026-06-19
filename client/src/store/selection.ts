import { create } from "zustand";

interface ClickModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

interface SelectionState {
  selected: Set<number>;
  anchor: number | null;
  isSelected: (id: number) => boolean;
  count: () => number;
  ids: () => number[];
  clear: () => void;
  selectExactly: (ids: number[]) => void;
  addMany: (ids: number[]) => void;
  toggle: (id: number) => void;
  /** Handle a card click with shift/ctrl semantics against the ordered list. */
  handleClick: (
    id: number,
    orderedIds: number[],
    mods: ClickModifiers
  ) => void;
}

export const useSelection = create<SelectionState>((set, get) => ({
  selected: new Set(),
  anchor: null,
  isSelected: (id) => get().selected.has(id),
  count: () => get().selected.size,
  ids: () => Array.from(get().selected),
  clear: () => set({ selected: new Set(), anchor: null }),
  selectExactly: (ids) =>
    set({ selected: new Set(ids), anchor: ids[ids.length - 1] ?? null }),
  addMany: (ids) =>
    set((s) => {
      const next = new Set(s.selected);
      ids.forEach((id) => next.add(id));
      return { selected: next };
    }),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next, anchor: id };
    }),
  handleClick: (id, orderedIds, mods) =>
    set((s) => {
      if (mods.shiftKey && s.anchor != null) {
        const a = orderedIds.indexOf(s.anchor);
        const b = orderedIds.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          const range = orderedIds.slice(lo, hi + 1);
          const next = new Set(s.selected);
          range.forEach((rid) => next.add(rid));
          return { selected: next, anchor: s.anchor };
        }
      }
      if (mods.ctrlKey || mods.metaKey) {
        const next = new Set(s.selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { selected: next, anchor: id };
      }
      return { selected: new Set([id]), anchor: id };
    }),
}));
