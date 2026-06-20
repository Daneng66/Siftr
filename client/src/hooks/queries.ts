import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { api, type PhotoQuery } from "../lib/api";
import { filterToQuery } from "../store/ui";
import type { FilterState, JobsResponse } from "../lib/types";

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
    staleTime: 30_000,
  });
}

export function useStats() {
  return useQuery({ queryKey: ["stats"], queryFn: api.stats });
}

export function useFolders() {
  return useQuery({ queryKey: ["folders"], queryFn: api.folders });
}

export function useJobs(_enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource("/api/jobs/stream");
    es.onmessage = (e: MessageEvent) => {
      qc.setQueryData(["jobs"], JSON.parse(e.data) as JobsResponse);
    };
    return () => es.close();
  }, [qc]);
  return useQuery<JobsResponse>({
    queryKey: ["jobs"],
    queryFn: api.jobs,
    staleTime: Infinity,
    gcTime: Infinity,
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
    qc.invalidateQueries({ queryKey: ["duplicates"] });
  };
}
