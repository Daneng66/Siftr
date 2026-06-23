import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { config } from "../config";

export type ThumbSize = "s" | "m";

/** Shard directory for a photo: {thumbsDir}/{id % 256} */
function thumbDir(id: number): string {
  return path.join(config.thumbsDir, String(id % 256));
}

/** Absolute path for a thumbnail file. */
export function thumbPath(id: number, size: ThumbSize): string {
  return path.join(thumbDir(id), `${id}.${size}.webp`);
}

function existsNonEmpty(p: string): boolean {
  try {
    return fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

export function thumbnailExists(id: number, size: ThumbSize): boolean {
  return existsNonEmpty(thumbPath(id, size));
}

/**
 * Generate WebP thumbnails (s + m sizes) and a LQIP for a photo.
 *
 * Uses a single Sharp decode: the source image is decoded and downscaled to
 * the medium size once, then that raw pixel buffer is used to produce the
 * small WebP and the LQIP without re-reading the file.
 *
 * Both size files are written atomically (temp → rename). Returns the LQIP
 * as a base64 data-URI string, or null on failure.
 */
export async function makeThumbnails(
  filePath: string,
  id: number
): Promise<{ lqip: string | null }> {
  const dir = thumbDir(id);
  const outS = thumbPath(id, "s");
  const outM = thumbPath(id, "m");

  try {
    fs.mkdirSync(dir, { recursive: true });

    // Single decode: rotate for EXIF orientation, then downscale to medium.
    // Raw pixels from the medium image are reused for all smaller outputs.
    const { data, info } = await sharp(filePath, { failOn: "none" })
      .rotate()
      .resize(config.thumbSizes.m, config.thumbSizes.m, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rawInput = {
      raw: { width: info.width, height: info.height, channels: info.channels as 1 | 2 | 3 | 4 },
    };

    const [sBuf, mBuf, lqipBuf] = await Promise.all([
      sharp(data, rawInput)
        .resize(config.thumbSizes.s, config.thumbSizes.s, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer(),
      sharp(data, rawInput).webp({ quality: 85 }).toBuffer(),
      sharp(data, rawInput)
        .resize(20, 20, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 10 })
        .toBuffer(),
    ]);

    await Promise.all([
      atomicWrite(outS, sBuf, id, "s"),
      atomicWrite(outM, mBuf, id, "m"),
    ]);

    return { lqip: `data:image/jpeg;base64,${lqipBuf.toString("base64")}` };
  } catch {
    return { lqip: null };
  }
}

async function atomicWrite(
  out: string,
  buf: Buffer,
  id: number,
  size: ThumbSize
): Promise<void> {
  const tmp = path.join(
    path.dirname(out),
    `.${id}.${size}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, out);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/** Remove both thumbnail sizes for a photo. Best-effort. */
export async function deleteThumbnails(id: number): Promise<void> {
  await Promise.all([
    fs.promises.rm(thumbPath(id, "s"), { force: true }).catch(() => {}),
    fs.promises.rm(thumbPath(id, "m"), { force: true }).catch(() => {}),
  ]);
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
