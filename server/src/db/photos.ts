import { getDb } from "./index";

export interface PhotoRow {
  id: number;
  path: string;
  original_filename: string;
  current_filename: string;
  file_hash: string | null;
  perceptual_hash: string | null;
  file_size: number;
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
  thumbnail_path: string | null;
  is_favorite: number;
  folder_id: number | null;
  mtime_ms: number;
  size_seen: number;
}

export interface PhotoUpsert {
  path: string;
  original_filename: string;
  current_filename: string;
  file_hash: string | null;
  perceptual_hash: string | null;
  file_size: number;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  exif_date_taken: string | null;
  exif_camera_make: string | null;
  exif_camera_model: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  date_modified: string | null;
  thumbnail_path: string | null;
  mtime_ms: number;
  size_seen: number;
}

/** Insert or update a photo keyed by its filesystem path. */
export function upsertPhoto(p: PhotoUpsert): void {
  getDb()
    .prepare(
      `INSERT INTO photos (
         path, original_filename, current_filename, file_hash, perceptual_hash,
         file_size, width, height, mime_type, exif_date_taken, exif_camera_make,
         exif_camera_model, gps_lat, gps_lon, date_modified, thumbnail_path,
         mtime_ms, size_seen
       ) VALUES (
         @path, @original_filename, @current_filename, @file_hash, @perceptual_hash,
         @file_size, @width, @height, @mime_type, @exif_date_taken, @exif_camera_make,
         @exif_camera_model, @gps_lat, @gps_lon, @date_modified, @thumbnail_path,
         @mtime_ms, @size_seen
       )
       ON CONFLICT(path) DO UPDATE SET
         current_filename = excluded.current_filename,
         file_hash        = excluded.file_hash,
         perceptual_hash  = excluded.perceptual_hash,
         file_size        = excluded.file_size,
         width            = excluded.width,
         height           = excluded.height,
         mime_type        = excluded.mime_type,
         exif_date_taken  = excluded.exif_date_taken,
         exif_camera_make = excluded.exif_camera_make,
         exif_camera_model= excluded.exif_camera_model,
         gps_lat          = excluded.gps_lat,
         gps_lon          = excluded.gps_lon,
         date_modified    = excluded.date_modified,
         thumbnail_path   = excluded.thumbnail_path,
         mtime_ms         = excluded.mtime_ms,
         size_seen        = excluded.size_seen`
    )
    .run(p);
}

export function getIndexedPaths(): Map<
  string,
  { id: number; mtime_ms: number; size_seen: number }
> {
  const rows = getDb()
    .prepare(`SELECT id, path, mtime_ms, size_seen FROM photos`)
    .all() as Array<{
    id: number;
    path: string;
    mtime_ms: number;
    size_seen: number;
  }>;
  const map = new Map<
    string,
    { id: number; mtime_ms: number; size_seen: number }
  >();
  for (const r of rows)
    map.set(r.path, { id: r.id, mtime_ms: r.mtime_ms, size_seen: r.size_seen });
  return map;
}

export function getPhotoById(id: number): PhotoRow | undefined {
  return getDb().prepare(`SELECT * FROM photos WHERE id = ?`).get(id) as
    | PhotoRow
    | undefined;
}

export function getPhotoByPath(path: string): PhotoRow | undefined {
  return getDb().prepare(`SELECT * FROM photos WHERE path = ?`).get(path) as
    | PhotoRow
    | undefined;
}

export function deletePhotoByPath(path: string): void {
  getDb().prepare(`DELETE FROM photos WHERE path = ?`).run(path);
}

export function deletePhotoById(id: number): void {
  getDb().prepare(`DELETE FROM photos WHERE id = ?`).run(id);
}

export function countPhotos(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM photos`).get() as {
    n: number;
  }).n;
}
