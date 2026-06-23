import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { config } from "../config";

/** Shard directory for a photo: {thumbsDir}/{id % 256} */
function thumbDir(id: number): string {
  return path.join(config.thumbsDir, String(id % 256));
}

/** Absolute path for a photo's grid thumbnail. */
export function thumbPath(id: number): string {
  return path.join(thumbDir(id), `${id}.webp`);
}

function existsNonEmpty(p: string): boolean {
  try {
    return fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

export function thumbnailExists(id: number): boolean {
  return existsNonEmpty(thumbPath(id));
}

/**
 * Generate the grid WebP thumbnail and a LQIP for a photo.
 *
 * Single Sharp decode: the source is decoded and downscaled to the grid size
 * once (as raw pixels), then that buffer produces both the WebP and the tiny
 * LQIP without re-reading the file.
 *
 * The WebP is written atomically (temp → rename). Returns the LQIP as a
 * base64 data-URI string, or null on failure.
 */
export async function makeThumbnails(
  filePath: string,
  id: number
): Promise<{ lqip: string | null }> {
  const dir = thumbDir(id);
  const out = thumbPath(id);

  try {
    fs.mkdirSync(dir, { recursive: true });

    // Decode once: rotate for EXIF orientation, resize to grid size, raw pixels.
    const { data, info } = await sharp(filePath, { failOn: "none" })
      .rotate()
      .resize(config.thumbSize, config.thumbSize, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rawInput = {
      raw: { width: info.width, height: info.height, channels: info.channels as 1 | 2 | 3 | 4 },
    };

    const [webpBuf, lqipBuf] = await Promise.all([
      sharp(data, rawInput).webp({ quality: 80 }).toBuffer(),
      sharp(data, rawInput)
        .resize(20, 20, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 10 })
        .toBuffer(),
    ]);

    const tmp = path.join(dir, `.${id}.${process.pid}.${randomUUID()}.tmp`);
    try {
      await fs.promises.writeFile(tmp, webpBuf);
      await fs.promises.rename(tmp, out);
    } catch (err) {
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }

    return { lqip: `data:image/jpeg;base64,${lqipBuf.toString("base64")}` };
  } catch {
    return { lqip: null };
  }
}

/** Remove the thumbnail for a photo. Best-effort. */
export async function deleteThumbnail(id: number): Promise<void> {
  await fs.promises.rm(thumbPath(id), { force: true }).catch(() => {});
}

/** Delete every cached thumbnail by removing and recreating the thumbnails dir. */
export async function clearThumbnails(): Promise<void> {
  try {
    await fs.promises.rm(config.thumbsDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  fs.mkdirSync(config.thumbsDir, { recursive: true });
}
