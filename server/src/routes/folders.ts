import { Router } from "express";
import { getDb } from "../db";

export const foldersRouter = Router();

interface FolderEntry {
  path: string;
  name: string;
  parent_path: string | null;
  photo_count: number;
}

/**
 * GET /api/folders — the actual on-disk folder structure, derived from where
 * photos live relative to the photos root. Every directory that contains (or is
 * an ancestor of a directory that contains) photos is returned as a flat list
 * with direct photo counts; the client assembles the tree. Read-only: folders
 * exist because files do, so they are created and removed by scanning, not here.
 */
foldersRouter.get("/", (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT rel_dir AS dir, COUNT(*) AS n
         FROM photos WHERE rel_dir <> '' GROUP BY rel_dir`
    )
    .all() as { dir: string; n: number }[];

  const directCounts = new Map<string, number>();
  const all = new Set<string>();
  for (const { dir, n } of rows) {
    directCounts.set(dir, n);
    // Register the folder and all of its ancestors so the tree is connected.
    const parts = dir.split("/");
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      all.add(acc);
    }
  }

  const folders: FolderEntry[] = [...all].map((p) => {
    const slash = p.lastIndexOf("/");
    return {
      path: p,
      name: slash >= 0 ? p.slice(slash + 1) : p,
      parent_path: slash >= 0 ? p.slice(0, slash) : null,
      photo_count: directCounts.get(p) ?? 0,
    };
  });
  folders.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  res.json({ folders });
});
