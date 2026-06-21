import type {
  DuplicateGroup,
  DupStatus,
  Folder,
  JobsResponse,
  PhotoDetail,
  PhotoSummary,
  RenamePlanItem,
  Stats,
  TrashStats,
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error ?? JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface PhotoQuery {
  folder?: string;
  duplicatesOnly?: boolean;
  search?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export const api = {
  thumbnailUrl: (id: number) => `/api/photos/${id}/thumbnail`,
  rawUrl: (id: number, download = false) =>
    `/api/photos/${id}/raw${download ? "?download=1" : ""}`,

  listPhotos: (q: PhotoQuery) => {
    const params = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => {
      if (v !== undefined && v !== false) params.set(k, String(v));
    });
    return request<{ total: number; items: PhotoSummary[] }>(
      `/api/photos?${params.toString()}`
    );
  },
  getPhoto: (id: number) => request<PhotoDetail>(`/api/photos/${id}`),

  stats: () => request<Stats>("/api/stats"),
  jobs: () => request<JobsResponse>("/api/jobs"),
  startScan: (hard = false) =>
    request<{ started: boolean }>("/api/scan", {
      method: "POST",
      body: JSON.stringify({ hard }),
    }),

  folders: () => request<{ folders: Folder[] }>("/api/folders"),

  duplicates: (kind?: "exact" | "similar") =>
    request<{ groups: DuplicateGroup[] }>(
      `/api/duplicates${kind ? `?kind=${kind}` : ""}`
    ),
  startDedup: () =>
    request<{ started: boolean }>("/api/duplicates/scan", { method: "POST" }),
  resolveGroup: (
    groupId: number,
    statuses: { photoId: number; status: DupStatus }[]
  ) =>
    request<{ updated: number }>(`/api/duplicates/${groupId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ statuses }),
    }),
  applyDuplicates: (groupId?: number, permanent?: boolean) =>
    request<{ deleted: number }>("/api/duplicates/apply", {
      method: "POST",
      body: JSON.stringify({
        ...(groupId !== undefined ? { groupId } : {}),
        ...(permanent ? { permanent } : {}),
      }),
    }),

  renamePreview: (photoIds: number[], pattern: string, customText: string) =>
    request<{ plan: RenamePlanItem[]; hasConflicts: boolean }>(
      "/api/rename/preview",
      {
        method: "POST",
        body: JSON.stringify({ photoIds, pattern, customText }),
      }
    ),
  renameApply: (photoIds: number[], pattern: string, customText: string) =>
    request<{ renamed: number; plan: RenamePlanItem[] }>("/api/rename/apply", {
      method: "POST",
      body: JSON.stringify({ photoIds, pattern, customText }),
    }),

  renamePhoto: (id: number, filename: string) =>
    request<{ ok: boolean }>(`/api/photos/${id}/rename`, {
      method: "PATCH",
      body: JSON.stringify({ filename }),
    }),

  editMetadata: (photoIds: number[], edits: Record<string, unknown>) =>
    request<{ updated: number }>("/api/metadata/bulk", {
      method: "POST",
      body: JSON.stringify({ photoIds, edits }),
    }),

  trash: () => request<TrashStats>("/api/trash"),
  restoreTrash: () =>
    request<{ restored: number }>("/api/trash/restore", { method: "POST" }),
  emptyTrash: () =>
    request<{ deleted: number }>("/api/trash/empty", { method: "POST" }),
};
