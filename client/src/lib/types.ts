export interface PhotoSummary {
  id: number;
  current_filename: string;
  file_size: number;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  exif_date_taken: string | null;
  thumbnail_path: string | null;
  rel_dir: string;
  dup_count: number;
}

export interface PhotoDetail extends PhotoSummary {
  path: string;
  original_filename: string;
  file_hash: string | null;
  perceptual_hash: string | null;
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
  photo_count: number;
}

export interface Stats {
  photos: number;
  totalSize: number;
  folders: number;
  /** Number of redundant duplicate copies (excludes the one kept per group). */
  duplicateCount: number;
  /** Bytes reclaimable by removing those redundant copies. */
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
  thumbnail_path: string | null;
  path: string;
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

export type FilterState =
  | { kind: "all" }
  | { kind: "duplicates" }
  | { kind: "folder"; path: string; name: string };

export type View = "library" | "duplicates";
