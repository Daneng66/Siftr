import Database from "better-sqlite3";
import { config } from "../config";
import { SCHEMA_SQL } from "./schema";
import { relDir } from "../util/relpath";

let dbInstance: Database.Database | null = null;

function columnExists(
  db: Database.Database,
  table: string,
  column: string
): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === column);
}

/**
 * Bring databases created by earlier versions up to the current schema:
 * derive each photo's folder from its path (`rel_dir`) and drop the old
 * virtual-organization tables (folders, tags). New databases already match.
 *
 * The `rel_dir` column and its index are managed here rather than in
 * SCHEMA_SQL: an existing photos table predates the column, so referencing it
 * in a `CREATE INDEX` at schema time would fail before this migration can add
 * it. Runs after SCHEMA_SQL, so the column is guaranteed to exist by the index.
 */
function migrate(db: Database.Database): void {
  if (!columnExists(db, "photos", "rel_dir")) {
    db.exec(`ALTER TABLE photos ADD COLUMN rel_dir TEXT NOT NULL DEFAULT ''`);
    const rows = db.prepare(`SELECT id, path FROM photos`).all() as {
      id: number;
      path: string;
    }[];
    const upd = db.prepare(`UPDATE photos SET rel_dir = ? WHERE id = ?`);
    const tx = db.transaction(() => {
      for (const r of rows) upd.run(relDir(r.path), r.id);
    });
    tx();
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_photos_rel_dir ON photos(rel_dir)`);
  // Old installs carry a `folder_id` column with a foreign key to the folders
  // table. Drop the column (and its index) before the table itself, otherwise
  // the dangling reference makes every later DELETE on photos fail with
  // "no such table: folders". The index must go first — SQLite refuses to drop
  // an indexed column.
  if (columnExists(db, "photos", "folder_id")) {
    db.exec(`DROP INDEX IF EXISTS idx_photos_folder`);
    db.exec(`ALTER TABLE photos DROP COLUMN folder_id`);
  }
  db.exec(`
    DROP TABLE IF EXISTS photo_tags;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS folders;
  `);
}

/** Open (once) the SQLite database and apply the schema. */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -65536");   // 64 MB page cache
  db.pragma("temp_store = MEMORY");
  db.pragma("mmap_size = 268435456"); // 256 MB memory-mapped I/O
  db.exec(SCHEMA_SQL);
  migrate(db);
  dbInstance = db;
  return db;
}
