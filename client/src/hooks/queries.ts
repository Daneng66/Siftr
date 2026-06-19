import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, type PhotoQuery } from "../lib/api";
import { filterToQuery } from "../store/ui";
import type { FilterState } from "../lib/types";

const PAGE_SIZE = 200;

/** Paginated photo feed for the current filter/sort/search. */
export function useInfinitePhotos(
  filter: FilterState,
  sort: string,
  search: string
) {
  const base: PhotoQuery = {
    ...filterToQuery(filter),
    sort,
    search: search || undefined,
    limit: PAGE_SIZE,
  };
  return useInfiniteQuery({
    queryKey: ["photos", base],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.listPhotos({ ...base, offset: pageParam as number }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
}

export function useStats() {
  return useQuery({ queryKey: ["stats"], queryFn: api.stats });
}

export function useFolders() {
  return useQuery({ queryKey: ["folders"], queryFn: api.folders });
}

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: api.tags });
}

export function useJobs(enabled: boolean) {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: api.jobs,
    refetchInterval: enabled ? 1500 : false,
  });
}

export function useDuplicates(kind?: "exact" | "similar") {
  return useQuery({
    queryKey: ["duplicates", kind ?? "all"],
    queryFn: () => api.duplicates(kind),
  });
}

/** Invalidate everything that a library mutation can affect. */
export function useInvalidateLibrary() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["photos"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["folders"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["duplicates"] });
  };
}
