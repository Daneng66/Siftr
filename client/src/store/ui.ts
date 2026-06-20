import { create } from "zustand";
import type { FilterState, View } from "../lib/types";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

interface UiState {
  theme: Theme;
  toggleTheme: () => void;
  view: View;
  setView: (v: View) => void;
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  sort: string;
  setSort: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
  detailPhotoId: number | null;
  setDetailPhotoId: (id: number | null) => void;
}

export const useUi = create<UiState>((set) => ({
  theme: initialTheme(),
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", theme === "dark");
      try {
        localStorage.setItem("siftr-theme", theme);
      } catch {
        /* ignore */
      }
      return { theme };
    }),
  view: "library",
  setView: (view) => set({ view }),
  filter: { kind: "all" },
  setFilter: (filter) => set({ filter }),
  sort: "date_taken_desc",
  setSort: (sort) => set({ sort }),
  search: "",
  setSearch: (search) => set({ search }),
  detailPhotoId: null,
  setDetailPhotoId: (detailPhotoId) => set({ detailPhotoId }),
}));

/** Translate a UI filter into photo-list query params. */
export function filterToQuery(filter: FilterState): {
  folder?: string;
  duplicatesOnly?: boolean;
} {
  switch (filter.kind) {
    case "duplicates":
      return { duplicatesOnly: true };
    case "folder":
      return { folder: filter.path };
    default:
      return {};
  }
}
