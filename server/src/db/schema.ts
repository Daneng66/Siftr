/**
 * SQLite schema. Applied idempotently at startup. SQLite is the metadata index
 * plus all virtual organization (folders, tags, duplicate groups);
 * the files on disk remain the source of truth for existence and bytes.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  parent_id  INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

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
  folder_id         INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  mtime_ms          INTEGER NOT NULL DEFAULT 0,
  size_seen         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_photos_file_hash ON photos(file_hash);
CREATE INDEX IF NOT EXISTS idx_photos_phash ON photos(perceptual_hash);
CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder_id);
CREATE INDEX IF NOT EXISTS idx_photos_date_taken ON photos(exif_date_taken);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS photo_tags (
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (photo_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_photo_tags_tag ON photo_tags(tag_id);

CREATE TABLE IF NOT EXISTS duplicate_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('exact','similar')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS duplicate_group_members (
  group_id   INTEGER NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
  photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'ignored'
               CHECK (status IN ('kept','marked_for_deletion','ignored')),
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
