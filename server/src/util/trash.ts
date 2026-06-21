import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "../config";

/**
 * A sidecar JSON file in the trash directory mapping each trashed file's name
 * to the absolute path it came from, so "Restore" can return it to its original
 * folder rather than dumping everything at the photos root.
 */
const MANIFEST_NAME = ".manifest.json";
const manifestPath = () => path.join(config.trashDir, MANIFEST_NAME);

type Manifest = Record<string, string>;

async function readManifest(): Promise<Manifest> {
  return fsp
    .readFile(manifestPath(), "utf8")
    .then((raw) => JSON.parse(raw) as Manifest)
    .catch(() => ({}));
}

async function writeManifest(manifest: Manifest): Promise<void> {
  await fsp.writeFile(manifestPath(), JSON.stringify(manifest, null, 2));
}

/**
 * Move a file into the configured `.trash` directory (reversible deletion).
 * Prefixes a timestamp to avoid name collisions and records the origin path in
 * the manifest. Returns the new path.
 */
export async function moveToTrash(absPath: string): Promise<string> {
  fs.mkdirSync(config.trashDir, { recursive: true });
  const base = path.basename(absPath);
  const name = `${Date.now()}-${base}`;
  const dest = path.join(config.trashDir, name);
  await moveFile(absPath, dest);
  const manifest = await readManifest();
  manifest[name] = absPath;
  await writeManifest(manifest);
  return dest;
}

/** Rename, falling back to copy + unlink when crossing devices (EXDEV). */
async function moveFile(src: string, dest: string): Promise<void> {
  await fsp.rename(src, dest).catch(async (err) => {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      await fsp.copyFile(src, dest);
      await fsp.unlink(src);
    } else {
      throw err;
    }
  });
}

/**
 * List the real files currently in the trash, excluding the manifest sidecar.
 * Returns each file's `name` (basename) and absolute `path`.
 */
async function listTrashFiles(): Promise<{ name: string; path: string }[]> {
  const entries = await fsp
    .readdir(config.trashDir, { withFileTypes: true })
    .catch((err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    });
  return entries
    .filter((e) => e.isFile() && e.name !== MANIFEST_NAME)
    .map((e) => ({ name: e.name, path: path.join(config.trashDir, e.name) }));
}

/** Aggregate count and total size (bytes) of everything in the trash. */
export async function getTrashStats(): Promise<{ count: number; size: number }> {
  const files = await listTrashFiles();
  let size = 0;
  for (const file of files) {
    const stat = await fsp.stat(file.path).catch(() => null);
    if (stat) size += stat.size;
  }
  return { count: files.length, size };
}

/**
 * Choose a non-colliding destination path: `name.ext`, then `name (1).ext`, etc.
 */
async function uniqueDest(dir: string, base: string): Promise<string> {
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  let candidate = path.join(dir, base);
  for (let i = 1; ; i++) {
    const exists = await fsp
      .access(candidate)
      .then(() => true)
      .catch(() => false);
    if (!exists) return candidate;
    candidate = path.join(dir, `${stem} (${i})${ext}`);
  }
}

/**
 * Restore every trashed file to the original path recorded in the manifest,
 * recreating the parent folder if needed. Files with no manifest entry fall
 * back to the photos root (stripping the `<timestamp>-` prefix). On a name
 * collision at the destination a `(n)` suffix is appended. The next scan
 * re-indexes the restored files. Returns how many were restored.
 */
export async function restoreAll(): Promise<number> {
  const files = await listTrashFiles();
  const manifest = await readManifest();
  let restored = 0;
  for (const file of files) {
    const origin = manifest[file.name];
    const targetDir = origin ? path.dirname(origin) : config.photosDir;
    const targetBase = origin
      ? path.basename(origin)
      : file.name.replace(/^\d+-/, "");
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      const dest = await uniqueDest(targetDir, targetBase);
      await moveFile(file.path, dest);
      delete manifest[file.name];
      restored++;
    } catch (err) {
      console.error("[trash] restore failed for", file.path, err);
    }
  }
  await writeManifest(manifest);
  return restored;
}

/** Permanently delete every file in the trash. Returns how many were removed. */
export async function emptyTrash(): Promise<number> {
  const files = await listTrashFiles();
  const manifest = await readManifest();
  let removed = 0;
  for (const file of files) {
    try {
      await fsp.unlink(file.path);
      delete manifest[file.name];
      removed++;
    } catch (err) {
      console.error("[trash] delete failed for", file.path, err);
    }
  }
  await writeManifest(manifest);
  return removed;
}
