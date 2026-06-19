import path from "node:path";
import fs from "node:fs";

/**
 * Central configuration, driven by environment variables so the same build runs
 * both locally (DATA_DIR=./data) and inside the container (DATA_DIR=/data).
 */
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "/data");

export const config = {
  port: Number(process.env.PORT ?? 8080),
  dataDir: DATA_DIR,
  photosDir: path.join(DATA_DIR, "photos"),
  thumbsDir: path.join(DATA_DIR, "thumbnails"),
  dbDir: path.join(DATA_DIR, "db"),
  trashDir: path.join(DATA_DIR, ".trash"),
  dbPath: path.join(DATA_DIR, "db", "siftr.sqlite"),

  /** Directory holding the built React SPA. Set in the Docker image. */
  clientDist:
    process.env.CLIENT_DIST ?? path.resolve(__dirname, "../../client/dist"),

  /** External tool binaries (installed in the image; overridable for local dev). */
  czkawkaBin: process.env.CZKAWKA_BIN ?? "czkawka_cli",
  exiftoolBin: process.env.EXIFTOOL_BIN ?? "exiftool",

  /** How many photos to hash/thumbnail in parallel during a scan. */
  scanConcurrency: Number(process.env.SCAN_CONCURRENCY ?? 4),
  thumbSize: Number(process.env.THUMB_SIZE ?? 256),

  /** Run an automatic scan of the photos directory on startup. */
  scanOnStartup: process.env.SCAN_ON_STARTUP !== "false",
};

/** Ensure all persistent sub-directories of the data volume exist. */
export function ensureDataDirs(): void {
  for (const dir of [
    config.dataDir,
    config.photosDir,
    config.thumbsDir,
    config.dbDir,
    config.trashDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".tif",
  ".tiff",
  ".bmp",
  ".heic",
  ".heif",
  ".avif",
]);
