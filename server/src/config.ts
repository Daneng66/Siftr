import path from "node:path";
import fs from "node:fs";
import os from "node:os";

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
  dbPath: path.join(DATA_DIR, "db", "siftr.sqlite"),

  /**
   * Where "Move to trash" relocates removed duplicates (reversible deletion).
   * Defaults to `.trash` inside the data volume, but can be pointed at a
   * separate path/share via TRASH_DIR — set as a mappable volume in the
   * container template, the same way the data and cache directories are.
   */
  trashDir: path.resolve(process.env.TRASH_DIR ?? path.join(DATA_DIR, ".trash")),

  /**
   * Where czkawka persists its hash/metadata cache. czkawka defaults to
   * `~/.cache/czkawka`, which lives outside the `/data` volume and is therefore
   * lost on every container recreate — forcing a full re-hash of the library on
   * the next dedup pass. Pointing it at the volume lets re-scans reuse cached
   * hashes for unchanged files (keyed on path+size+mtime).
   */
  czkawkaCachePath:
    process.env.CZKAWKA_CACHE_PATH ?? path.join(DATA_DIR, "cache", "czkawka"),

  /** Directory holding the built React SPA. Set in the Docker image. */
  clientDist:
    process.env.CLIENT_DIST ?? path.resolve(__dirname, "../../client/dist"),

  /** External tool binaries (installed in the image; overridable for local dev). */
  czkawkaBin: process.env.CZKAWKA_BIN ?? "czkawka_cli",
  exiftoolBin: process.env.EXIFTOOL_BIN ?? "exiftool",

  /** czkawka similarity preset for near-duplicate images (Minimal..VeryHigh). */
  czkawkaImagePreset: process.env.CZKAWKA_IMAGE_PRESET ?? "High",

  /**
   * Whether to also run czkawka's similar-image (perceptual) pass. Off for now —
   * dedup focuses on exact hash-based duplicates. Set DEDUP_SIMILAR=true to enable.
   */
  dedupSimilarEnabled: process.env.DEDUP_SIMILAR === "true",

  /** How many photos to process in parallel during a scan. Defaults to half the CPU count, minimum 4. */
  scanConcurrency: Number(
    process.env.SCAN_CONCURRENCY ?? Math.max(4, Math.floor(os.cpus().length / 2))
  ),
  thumbSizes: {
    s: Number(process.env.THUMB_SIZE_S ?? 240),
    m: Number(process.env.THUMB_SIZE_M ?? 720),
  },

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
    config.czkawkaCachePath,
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
