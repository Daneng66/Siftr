import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../config";

/**
 * Move a file into the data volume's `.trash` directory (reversible deletion).
 * Prefixes a timestamp to avoid name collisions. Returns the new path.
 */
export async function moveToTrash(absPath: string): Promise<string> {
  fs.mkdirSync(config.trashDir, { recursive: true });
  const base = path.basename(absPath);
  const dest = path.join(config.trashDir, `${Date.now()}-${base}`);
  await fsp.rename(absPath, dest).catch(async (err) => {
    // rename fails across devices — fall back to copy + unlink.
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      await fsp.copyFile(absPath, dest);
      await fsp.unlink(absPath);
    } else {
      throw err;
    }
  });
  return dest;
}
