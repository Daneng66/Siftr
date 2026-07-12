export interface PhotoSummary {
  id: number;
  current_filename: string;
  file_size: number;
  rel_dir: string;
  dup_count: number;
  lqip: string | null;
  mtime_ms: number;
}

export interface PhotoDetail extends PhotoSummary {
  path: string;
  original_filename: string;
  file_hash: string | null;
  perceptual_hash: string | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  exif_date_taken: string | null;
  exif_camera_make: string | null;
  exif_camera_model: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  date_imported: string;
  date_modified: string | null;
}

/** A directory on disk that contains photos (or descends to one). */
export interface Folder {
  path: string;
  name: string;
  parent_path: string | null;
  /** Photos in this folder plus every subfolder beneath it. */
  photo_count: number;
}

export interface Stats {
  photos: number;
  totalSize: number;
  folders: number;
  /** Number of duplicate groups (not the number of photos across them). */
  duplicateCount: number;
  /** Bytes reclaimable by removing the redundant copies in those groups. */
  reclaimableSize: number;
}

export interface Job {
  id: string;
  type: string;
  status: string;
  progress: number;
  total: number;
  message: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobsResponse {
  jobs: Job[];
  scanRunning: boolean;
  dedupRunning: boolean;
  thumbRunning: boolean;
  /** True for the whole duration of a hard scan; the UI hides images and stats until it completes. */
  hardScanRunning: boolean;
  /** Increments each time an explicit "regenerate all thumbnails" job starts. Used to immediately clear displayed thumbnails and cache-bust URLs. */
  thumbSeed: number;
}

export interface TrashStats {
  count: number;
  size: number;
}

export type DupStatus = "kept" | "recommended" | "marked_for_deletion" | "ignored";

export interface DuplicateMember {
  group_id: number;
  photo_id: number;
  status: DupStatus;
  similarity: string | null;
  current_filename: string;
  file_size: number;
  width: number | null;
  height: number | null;
  path: string;
  rel_dir: string;
  mtime_ms: number;
}

export interface DuplicateGroup {
  id: number;
  kind: "exact" | "similar";
  created_at: string;
  members: DuplicateMember[];
}

export interface RenamePlanItem {
  photoId: number;
  currentName: string;
  newName: string;
  conflict: string | null;
}

/** Which photos an organize run applies to — mirrors the sidebar folder filter. */
export type OrganizeScope = { kind: "all" } | { kind: "folder"; path: string };

/** What {date:...} tokens resolve to when a photo has no EXIF date taken. */
export type OrganizeDateFallback = "unknown" | "fileModified";

export interface OrganizeOptions {
  retainStructure: boolean;
  dateFallback: OrganizeDateFallback;
}

export interface OrganizePlanItem {
  photoId: number;
  currentRelPath: string;
  newRelPath: string;
  conflict: string | null;
  unchanged: boolean;
  /** True if a `_{n}` suffix was appended to avoid clashing with another target. */
  disambiguated: boolean;
}

export type FilterState =
  | { kind: "all" }
  | { kind: "duplicates" }
  | { kind: "folder"; path: string; name: string };

export type View = "library" | "duplicates";
