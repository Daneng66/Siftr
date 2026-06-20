/**
 * SQLite schema. Applied idempotently at startup. SQLite is the metadata index
 * plus duplicate-group bookkeeping; the files on disk remain the source of truth
 * for existence, bytes, and folder structure. A photo's folder is derived from
 * its location on disk (`rel_dir`), not stored as a virtual organization.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS photos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  path              TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  current_filename  TEXT NOT NULL,
  file_hash         TEXT,
  perceptual_hash   TEXT,
  file_size         INTEGER NOT NULL,
  width             INTEGER,
  height            INTEGER,
  mime_type         TEXT,
  exif_date_taken   TEXT,
  exif_camera_make  TEXT,
  exif_camera_model TEXT,
  gps_lat           REAL,
  gps_lon           REAL,
  date_imported     TEXT NOT NULL DEFAULT (datetime('now')),
  date_modified     TEXT,
  thumbnail_path    TEXT,
  rel_dir           TEXT NOT NULL DEFAULT '',
  mtime_ms          INTEGER NOT NULL DEFAULT 0,
  size_seen         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_photos_file_hash ON photos(file_hash);
CREATE INDEX IF NOT EXISTS idx_photos_phash ON photos(perceptual_hash);
CREATE INDEX IF NOT EXISTS idx_photos_date_taken ON photos(exif_date_taken);

CREATE TABLE IF NOT EXISTS duplicate_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('exact','similar')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS duplicate_group_members (
  group_id   INTEGER NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
  photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'ignored'
               CHECK (status IN ('kept','recommended','marked_for_deletion','ignored')),
  similarity REAL,
  PRIMARY KEY (group_id, photo_id)
);
CREATE INDEX IF NOT EXISTS idx_dup_members_photo ON duplicate_group_members(photo_id);

CREATE TABLE IF NOT EXISTS jobs (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  status     TEXT NOT NULL,
  progress   INTEGER NOT NULL DEFAULT 0,
  total      INTEGER NOT NULL DEFAULT 0,
  message    TEXT,
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
