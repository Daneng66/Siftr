import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { config } from "../config";

/**
 * Generate a WebP thumbnail for a file, named by photo ID. Returns the
 * filename (relative to thumbsDir), or null on failure.
 */
export async function makeThumbnail(
  filePath: string,
  id: number
): Promise<string | null> {
  const name = `${id}.webp`;
  const out = path.join(config.thumbsDir, name);
  try {
    // Reuse an existing, non-empty thumbnail — duplicates share one file by
    // hash. A 0-byte file means a previous run was interrupted mid-write, so
    // treat it as missing and regenerate.
    if (existsNonEmpty(out)) return name;

    // Write to a unique temp file, then atomically rename into place. Without
    // this, a concurrent worker (or an HTTP request) could observe the final
    // path while sharp is still flushing bytes and treat a 0-byte file as a
    // finished thumbnail — which then gets cached by the browser for a day.
    const tmp = path.join(
      config.thumbsDir,
      `.${id}.${process.pid}.${randomUUID()}.tmp`
    );
    try {
      await sharp(filePath, { failOn: "none" })
        .rotate()
        .resize(config.thumbSize, config.thumbSize, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78 })
        .toFile(tmp);
      await fs.promises.rename(tmp, out);
    } catch (err) {
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
    return name;
  } catch {
    return null;
  }
}

/** True if the path exists and has a non-zero size. */
function existsNonEmpty(p: string): boolean {
  try {
    return fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

export function thumbnailAbsPath(name: string): string {
  return path.join(config.thumbsDir, name);
}

/**
 * Remove the cached thumbnail for a photo id, if one exists. Best-effort: the
 * file is named deterministically (`{id}.webp`), so we can clean it up by id
 * without consulting the DB. Called when a photo is deleted/pruned so its
 * thumbnail doesn't linger as an orphan.
 */
export async function deleteThumbnail(id: number): Promise<void> {
  await fs.promises
    .rm(path.join(config.thumbsDir, `${id}.webp`), { force: true })
    .catch(() => {});
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
