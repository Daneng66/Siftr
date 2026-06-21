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
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["stats"],
    queryFn: api.stats,
    // While a scan or dedup is running the library is actively changing, so poll
    // to keep the sidebar counts current; stop polling once everything is idle.
    // A hard scan hides the stats entirely, so there's nothing to keep current.
    refetchInterval: () => {
      const jobs = qc.getQueryData<JobsResponse>(["jobs"]);
      if (!jobs || jobs.hardScanRunning) return false;
      return jobs.scanRunning || jobs.dedupRunning ? 2000 : false;
    },
  });
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
  return useJobsSnapshot();
}

/**
 * Read the current jobs snapshot from the shared `["jobs"]` cache without
 * opening another SSE stream — `useJobs()` (mounted in TopNav) keeps it live.
 */
export function useJobsSnapshot() {
  return useQuery<JobsResponse>({
    queryKey: ["jobs"],
    queryFn: api.jobs,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** True for the whole duration of a hard scan (hides images/stats until done). */
export function useHardScanRunning(): boolean {
  return useJobsSnapshot().data?.hardScanRunning ?? false;
}

/** File count and total size currently sitting in the trash. */
export function useTrash() {
  return useQuery({ queryKey: ["trash"], queryFn: api.trash });
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
    qc.invalidateQueries({ queryKey: ["trash"] });
  };
}

/**
 * Drop the browsable library caches so the UI falls back to its empty, pre-scan
 * state. Used when a hard scan wipes the index: rather than show stale data, the
 * app reverts to the "No photos here yet" onboarding look until the rebuild lands.
 *
 * Stats are deliberately left alone — they poll live during a scan so the sidebar
 * counts stay current (showing the rebuild's progress) rather than blanking out.
 */
export function useResetLibrary() {
  const qc = useQueryClient();
  return () => {
    qc.resetQueries({ queryKey: ["photos"] });
    qc.resetQueries({ queryKey: ["folders"] });
    qc.resetQueries({ queryKey: ["duplicates"] });
  };
}
