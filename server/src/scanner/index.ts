import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config, IMAGE_EXTENSIONS } from "../config";
import { mapLimit } from "../util/concurrency";
import { relDir } from "../util/relpath";
import { readExif } from "./exif";
import { clearThumbnails, deleteThumbnail, makeThumbnail } from "./thumbnails";
import {
  batchDeletePhotos,
  beginBatch,
  clearLibrary,
  commitBatch,
  getIndexedPaths,
  getPhotosWithMissingThumbnails,
  rollbackBatch,
  updateThumbnailPath,
  upsertPhoto,
} from "../db/photos";
import { jobs } from "../jobs";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".avif": "image/avif",
};

/** Recursively collect image file paths under a directory. */
async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        // skip our own managed dirs if photos dir is nested oddly
        if (entry.name === "thumbnails" || entry.name === ".trash") continue;
        await recurse(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) out.push(full);
      }
    }
  }
  await recurse(dir);
  return out;
}

async function indexFile(filePath: string, stat: fs.Stats): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();

  let width: number | null = null;
  let height: number | null = null;
  try {
    const meta = await sharp(filePath, { failOn: "none" }).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
    if (meta.orientation && meta.orientation >= 5 && width && height) {
      [width, height] = [height, width];
    }
  } catch {
    /* unreadable image — still index basic info */
  }

  const exif = await readExif(filePath);
  const filename = path.basename(filePath);

  upsertPhoto({
    path: filePath,
    original_filename: filename,
    current_filename: filename,
    file_hash: null,  // populated by czkawka dup after scan
    // Perceptual hashing is delegated entirely to czkawka's image pass; we no
    // longer compute our own (it was a full image decode whose result was never
    // read). Left null in the index.
    perceptual_hash: null,
    file_size: stat.size,
    width,
    height,
    mime_type: MIME_BY_EXT[ext] ?? null,
    exif_date_taken: exif.dateTaken,
    exif_camera_make: exif.cameraMake,
    exif_camera_model: exif.cameraModel,
    gps_lat: exif.gpsLat,
    gps_lon: exif.gpsLon,
    date_modified: new Date(stat.mtimeMs).toISOString(),
    thumbnail_path: null,
    rel_dir: relDir(filePath),
    mtime_ms: Math.floor(stat.mtimeMs),
    size_seen: stat.size,
  });
}

/** Re-index a single file (used after rename / metadata writes). No-op if gone. */
export async function reindexFile(filePath: string): Promise<void> {
  try {
    const stat = await fsp.stat(filePath);
    await indexFile(filePath, stat);
  } catch {
    /* file vanished — ignore */
  }
}

// Commit every N files. Large enough to amortise per-transaction fsync overhead
// while keeping progress updates flowing to the UI between batches.
const SCAN_BATCH_SIZE = 500;

export interface ScanResult {
  scanned: number;
  added: number;
  updated: number;
  removed: number;
}

/**
 * How thorough a scan is:
 * - `"soft"` (default): only re-index files that changed by mtime+size.
 * - `"hard"`: wipe the photo index and all cached thumbnails first, forcing a
 *   full rebuild from disk.
 */
export type ScanMode = "soft" | "hard";

/**
 * Index the photos directory. New/changed files (by mtime+size) are hashed,
 * thumbnailed and upserted; vanished files are pruned. Tracked as a `scan` job.
 * A hard scan first clears all indexed data and thumbnails, then regenerates.
 */
export async function scanLibrary(mode: ScanMode = "soft"): Promise<ScanResult> {
  const hard = mode === "hard";
  const job = jobs.create(
    "scan",
    hard ? "Hard scan: clearing data…" : "Scanning library…",
    { hard }
  );
  const result: ScanResult = { scanned: 0, added: 0, updated: 0, removed: 0 };
  const startMs = Date.now();
  try {
    if (hard) {
      clearLibrary();
      await clearThumbnails();
    }
    const files = await walk(config.photosDir);
    const existing = getIndexedPaths();
    const seen = new Set<string>();
    let processed = 0;
    jobs.update(job.id, { total: files.length, message: "Indexing photos…" });

    // Process files in chunks so each chunk commits as one transaction.
    // Committing per-chunk (rather than per-file) removes ~99% of fsync
    // overhead while still letting progress updates reach the UI after each
    // batch commits.
    for (let i = 0; i < files.length; i += SCAN_BATCH_SIZE) {
      const chunk = files.slice(i, i + SCAN_BATCH_SIZE);
      beginBatch();
      try {
        await mapLimit(chunk, config.scanConcurrency, async (file) => {
          seen.add(file);
          try {
            const stat = await fsp.stat(file);
            const prev = existing.get(file);
            const unchanged =
              prev &&
              prev.mtime_ms === Math.floor(stat.mtimeMs) &&
              prev.size_seen === stat.size;
            if (!unchanged) {
              await indexFile(file, stat);
              if (prev) result.updated++;
              else result.added++;
            }
            result.scanned++;
          } catch {
            /* skip unreadable file */
          } finally {
            processed++;
          }
        });
        commitBatch();
      } catch (err) {
        rollbackBatch();
        throw err;
      }
      jobs.update(job.id, { progress: processed });
    }

    // Prune files that disappeared from disk (single transaction), and clean up
    // their cached thumbnails so they don't linger as orphans.
    const toDelete: string[] = [];
    const removedIds: number[] = [];
    for (const [knownPath, info] of existing) {
      if (!seen.has(knownPath)) {
        toDelete.push(knownPath);
        removedIds.push(info.id);
        result.removed++;
      }
    }
    batchDeletePhotos(toDelete);
    await Promise.all(removedIds.map((id) => deleteThumbnail(id)));

    jobs.update(job.id, {
      progress: files.length,
      message: `Added ${result.added}, updated ${result.updated}, removed ${result.removed}`,
    });
    console.log(
      `[scan] done in ${((Date.now() - startMs) / 1000).toFixed(1)}s — ` +
      `added ${result.added}, updated ${result.updated}, removed ${result.removed}, ` +
      `skipped ${result.scanned - result.added - result.updated}`
    );
    jobs.finish(job.id, "scan");
    return result;
  } catch (err) {
    jobs.finish(job.id, "scan", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * Generate thumbnails for all photos that don't have one yet. Tracked as a
 * `thumb` job so the frontend can show a progress indicator and know when
 * all thumbnails are ready.
 */
export async function runThumbnailJob(regenerate = false): Promise<void> {
  const photos = getPhotosWithMissingThumbnails();
  if (photos.length === 0) return;

  const job = jobs.create("thumb", "Generating thumbnails…", { regenerate });
  jobs.update(job.id, { total: photos.length });
  let done = 0;
  try {
    for (let i = 0; i < photos.length; i += SCAN_BATCH_SIZE) {
      const chunk = photos.slice(i, i + SCAN_BATCH_SIZE);
      await mapLimit(chunk, config.scanConcurrency, async ({ id, path }) => {
        const thumbPath = await makeThumbnail(path, id);
        if (thumbPath) updateThumbnailPath(id, thumbPath);
        done++;
      });
      jobs.update(job.id, { progress: done });
    }
    jobs.finish(job.id, "thumb");
    console.log(`[thumb] done — generated thumbnails for ${photos.length} photos`);
  } catch (err) {
    jobs.finish(job.id, "thumb", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
