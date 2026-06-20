import path from "node:path";
import { config } from "../config";

/**
 * The directory of a photo relative to the photos root, normalized to
 * forward slashes so it is stable across OSes and easy to split into a tree.
 * Returns "" for files that live directly in the photos root (or outside it).
 */
export function relDir(filePath: string): string {
  const rel = path.relative(config.photosDir, path.dirname(filePath));
  if (!rel || rel.startsWith("..")) return "";
  return rel.split(path.sep).join("/");
}
