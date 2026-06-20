import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { config } from "../config";
import { mapLimit } from "../util/concurrency";
import { jobs } from "../jobs";
import {
  getPhotosNeedingThumbnails,
  updateThumbnailPath,
} from "../db/photos";

/**
 * Generate a WebP thumbnail for a file, named by its hash so identical files
 * share one thumbnail. Returns the filename (relative to thumbsDir), or null
 * on failure.
 */
export async function makeThumbnail(
  filePath: string,
  fileHash: string
): Promise<string | null> {
  const name = `${fileHash}.webp`;
  const out = path.join(config.thumbsDir, name);
  try {
    if (!fs.existsSync(out)) {
      await sharp(filePath, { failOn: "none" })
        .rotate()
        .resize(config.thumbSize, config.thumbSize, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78 })
        .toFile(out);
    }
    return name;
  } catch {
    return null;
  }
}

export function thumbnailAbsPath(name: string): string {
  return path.join(config.thumbsDir, name);
}

/** Delete every cached thumbnail. Used by a hard scan before regenerating. */
export async function clearThumbnails(): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(config.thumbsDir);
  } catch {
    return; // dir doesn't exist yet — nothing to clear
  }
  await Promise.all(
    entries
      .filter((name) => name.endsWith(".webp"))
      .map((name) =>
        fs.promises.rm(path.join(config.thumbsDir, name)).catch(() => {})
      )
  );
}

/**
 * Background job: generate thumbnails for all photos that don't have one yet.
 * Runs after a scan so indexing completes quickly and thumbnails fill in
 * without blocking the user from browsing the library.
 */
export async function generateThumbnails(): Promise<void> {
  if (jobs.isRunning("thumb")) return;

  const photos = getPhotosNeedingThumbnails();
  if (photos.length === 0) return;

  const job = jobs.create("thumb", "Generating thumbnails…");
  jobs.update(job.id, { total: photos.length });
  let processed = 0;

  try {
    await mapLimit(photos, config.scanConcurrency, async (photo) => {
      try {
        const thumbPath = await makeThumbnail(photo.path, photo.file_hash);
        if (thumbPath) updateThumbnailPath(photo.id, thumbPath);
      } catch {
        /* skip unprocessable photo */
      } finally {
        processed++;
        if (processed % 10 === 0 || processed === photos.length) {
          jobs.update(job.id, { progress: processed });
        }
      }
    });
    jobs.update(job.id, {
      progress: photos.length,
      message: `Generated ${photos.length} thumbnail(s)`,
    });
    jobs.finish(job.id, "thumb");
  } catch (err) {
    jobs.finish(
      job.id,
      "thumb",
      err instanceof Error ? err.message : String(err)
    );
    throw err;
  }
}
