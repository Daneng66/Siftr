import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { config } from "../config";

/**
 * Grab a single poster frame from a video as a JPEG buffer via ffmpeg, seeking
 * a couple seconds in (skips black opening frames / codec init) but capped low
 * enough that short clips still yield a frame. Falls back to the very first
 * frame if seeking past the end fails.
 */
function extractVideoFrame(filePath: string, seekSeconds: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      config.ffmpegBin,
      [
        "-ss",
        String(seekSeconds),
        "-i",
        filePath,
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-y",
        "pipe:1",
      ],
      { maxBuffer: 64 * 1024 * 1024, encoding: "buffer" },
      (err, stdout) => {
        if (err || !stdout || stdout.length === 0) {
          return reject(err ?? new Error("empty frame"));
        }
        resolve(stdout as unknown as Buffer);
      }
    );
  });
}

async function grabVideoFrame(filePath: string): Promise<Buffer> {
  try {
    return await extractVideoFrame(filePath, 2);
  } catch {
    return extractVideoFrame(filePath, 0);
  }
}

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
  id: number,
  mediaType: "image" | "video" = "image"
): Promise<{ lqip: string | null }> {
  const dir = thumbDir(id);
  const out = thumbPath(id);

  try {
    fs.mkdirSync(dir, { recursive: true });

    // For video, ffmpeg extracts a poster frame first; from there on it's the
    // same sharp pipeline as an image (source is either the file path or that
    // frame's JPEG bytes).
    const source = mediaType === "video" ? await grabVideoFrame(filePath) : filePath;

    // Decode once: rotate for EXIF orientation, resize to grid size, raw pixels.
    const { data, info } = await sharp(source, { failOn: "none" })
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
