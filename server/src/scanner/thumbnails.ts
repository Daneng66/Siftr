import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { config } from "../config";

/**
 * Generate a WebP thumbnail named by the file hash (so identical files share a
 * thumbnail). Returns the path relative to the thumbnails dir, or null on failure.
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
        .rotate() // respect EXIF orientation
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
