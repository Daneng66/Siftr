import Database from "better-sqlite3";
import { config } from "../config";
import { SCHEMA_SQL } from "./schema";

let dbInstance: Database.Database | null = null;

/** Open (once) the SQLite database and apply the schema. */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.exec(SCHEMA_SQL);
  dbInstance = db;
  return db;
}
