import type Database from "better-sqlite3";
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
  rel_dir: string;
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
  rel_dir: string;
  mtime_ms: number;
  size_seen: number;
}

// Lazily cached prepared statements — avoids re-compiling SQL on every call.
let _upsertStmt: Database.Statement | null = null;
let _deleteByPathStmt: Database.Statement | null = null;
let _updateThumbStmt: Database.Statement | null = null;

function getUpsertStmt(): Database.Statement {
  return (_upsertStmt ??= getDb().prepare(
    `INSERT INTO photos (
       path, original_filename, current_filename, file_hash, perceptual_hash,
       file_size, width, height, mime_type, exif_date_taken, exif_camera_make,
       exif_camera_model, gps_lat, gps_lon, date_modified, thumbnail_path,
       rel_dir, mtime_ms, size_seen
     ) VALUES (
       @path, @original_filename, @current_filename, @file_hash, @perceptual_hash,
       @file_size, @width, @height, @mime_type, @exif_date_taken, @exif_camera_make,
       @exif_camera_model, @gps_lat, @gps_lon, @date_modified, @thumbnail_path,
       @rel_dir, @mtime_ms, @size_seen
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
       rel_dir          = excluded.rel_dir,
       mtime_ms         = excluded.mtime_ms,
       size_seen        = excluded.size_seen`
  ));
}

/** Insert or update a photo keyed by its filesystem path. */
export function upsertPhoto(p: PhotoUpsert): void {
  getUpsertStmt().run(p);
}

/**
 * Begin an explicit write transaction. Use with commitBatch/rollbackBatch when
 * async work (indexFile calls) must happen between begin and commit — the
 * better-sqlite3 db.transaction() helper only works for synchronous functions.
 */
export function beginBatch(): void {
  getDb().exec("BEGIN");
}

export function commitBatch(): void {
  getDb().exec("COMMIT");
}

export function rollbackBatch(): void {
  try {
    getDb().exec("ROLLBACK");
  } catch {
    // no-op if no transaction is open
  }
}

/** Delete multiple photos by path in a single transaction. */
export function batchDeletePhotos(paths: string[]): void {
  if (paths.length === 0) return;
  const db = getDb();
  _deleteByPathStmt ??= db.prepare(`DELETE FROM photos WHERE path = ?`);
  const stmt = _deleteByPathStmt;
  db.transaction(() => {
    for (const p of paths) stmt.run(p);
  })();
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
  (_deleteByPathStmt ??= getDb().prepare(`DELETE FROM photos WHERE path = ?`)).run(path);
}

export function deletePhotoById(id: number): void {
  getDb().prepare(`DELETE FROM photos WHERE id = ?`).run(id);
}

/**
 * Wipe the entire photo index and everything derived from it (duplicate
 * groups). Folders are derived from photo paths, so they rebuild automatically
 * on the next scan. Runs in a single transaction.
 */
export function clearLibrary(): void {
  const db = getDb();
  // A managed transaction rolls back automatically on error rather than leaving
  // a half-open one behind (which would poison every later transaction with
  // "cannot start a transaction within a transaction").
  const clear = db.transaction(() => {
    db.prepare(`DELETE FROM duplicate_group_members`).run();
    db.prepare(`DELETE FROM duplicate_groups`).run();
    db.prepare(`DELETE FROM photos`).run();
  });
  clear();
}

export function getPhotosNeedingThumbnails(): Array<{
  id: number;
  path: string;
  file_hash: string;
}> {
  return getDb()
    .prepare(
      `SELECT id, path, file_hash FROM photos WHERE thumbnail_path IS NULL ORDER BY id`
    )
    .all() as Array<{ id: number; path: string; file_hash: string }>;
}

export function updateThumbnailPath(id: number, thumbnailPath: string | null): void {
  (_updateThumbStmt ??= getDb().prepare(
    `UPDATE photos SET thumbnail_path = ? WHERE id = ?`
  )).run(thumbnailPath, id);
}

export function countPhotos(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM photos`).get() as {
    n: number;
  }).n;
}
