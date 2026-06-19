import type {
  DuplicateGroup,
  DupStatus,
  Folder,
  JobsResponse,
  PhotoDetail,
  PhotoSummary,
  RenamePlanItem,
  Stats,
  Tag,
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
  folderId?: string;
  favorite?: boolean;
  tagId?: number;
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
  toggleFavorite: (id: number, favorite?: boolean) =>
    request<{ id: number; is_favorite: number }>(
      `/api/photos/${id}/favorite`,
      { method: "PATCH", body: JSON.stringify({ favorite }) }
    ),

  stats: () => request<Stats>("/api/stats"),
  jobs: () => request<JobsResponse>("/api/jobs"),
  startScan: () => request<{ started: boolean }>("/api/scan", { method: "POST" }),

  folders: () => request<{ folders: Folder[] }>("/api/folders"),
  createFolder: (name: string, parentId: number | null) =>
    request<Folder>("/api/folders", {
      method: "POST",
      body: JSON.stringify({ name, parentId }),
    }),
  deleteFolder: (id: number) =>
    request(`/api/folders/${id}`, { method: "DELETE" }),

  tags: () => request<{ tags: Tag[] }>("/api/tags"),
  assignTag: (photoIds: number[], tagName?: string, tagId?: number) =>
    request<{ tagId: number; assigned: number }>("/api/tags/assign", {
      method: "POST",
      body: JSON.stringify({ photoIds, tagName, tagId }),
    }),
  unassignTag: (photoIds: number[], tagId: number) =>
    request("/api/tags/unassign", {
      method: "POST",
      body: JSON.stringify({ photoIds, tagId }),
    }),

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
  applyDuplicates: (groupId?: number) =>
    request<{ deleted: number }>("/api/duplicates/apply", {
      method: "POST",
      body: JSON.stringify(groupId ? { groupId } : {}),
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

  editMetadata: (photoIds: number[], edits: Record<string, unknown>) =>
    request<{ updated: number }>("/api/metadata/bulk", {
      method: "POST",
      body: JSON.stringify({ photoIds, edits }),
    }),

  moveToFolder: (photoIds: number[], folderId: number | null) =>
    request<{ moved: number }>("/api/organize/move", {
      method: "POST",
      body: JSON.stringify({ photoIds, folderId }),
    }),
  autoOrganize: (rule: string, photoIds?: number[]) =>
    request<{ assigned: number; skipped: number }>("/api/organize/auto", {
      method: "POST",
      body: JSON.stringify({ rule, photoIds }),
    }),
};
