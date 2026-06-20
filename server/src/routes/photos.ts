import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getDb } from "../db";
import { getPhotoById, updateThumbnailPath } from "../db/photos";
import { makeThumbnail, thumbnailAbsPath } from "../scanner/thumbnails";

// Keyed by photo ID — deduplicates concurrent requests for the same photo.
const thumbInFlight = new Map<number, Promise<string | null>>();

export const photosRouter = Router();

const listQuery = z.object({
  folder: z.string().optional(), // rel_dir of an on-disk folder
  duplicatesOnly: z.coerce.boolean().optional(),
  hideDuplicates: z.coerce.boolean().optional(),
  search: z.string().optional(),
  sort: z
    .enum([
      "date_taken_desc",
      "date_taken_asc",
      "name_asc",
      "name_desc",
      "size_desc",
      "imported_desc",
    ])
    .default("date_taken_desc"),
  limit: z.coerce.number().min(1).max(500).default(100),
  offset: z.coerce.number().min(0).default(0),
});

const SORT_SQL: Record<string, string> = {
  date_taken_desc: "p.exif_date_taken DESC, p.date_imported DESC",
  date_taken_asc: "p.exif_date_taken ASC, p.date_imported ASC",
  name_asc: "p.current_filename COLLATE NOCASE ASC",
  name_desc: "p.current_filename COLLATE NOCASE DESC",
  size_desc: "p.file_size DESC",
  imported_desc: "p.date_imported DESC",
};

/** GET /api/photos — filtered, sorted, paginated grid feed with badge counts. */
photosRouter.get("/", (req, res) => {
  const q = listQuery.parse(req.query);
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (q.folder !== undefined) {
    where.push("p.rel_dir = @folder");
    params.folder = q.folder;
  }
  if (q.duplicatesOnly) {
    where.push(
      "EXISTS (SELECT 1 FROM duplicate_group_members dgm WHERE dgm.photo_id = p.id)"
    );
  }
  if (q.search) {
    where.push("p.current_filename LIKE @search");
    params.search = `%${q.search}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const db = getDb();

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM photos p ${whereSql}`)
      .get(params) as { n: number }
  ).n;

  // LEFT JOIN + GROUP BY instead of a correlated subquery per row.
  // Only the fields used in the grid are returned; detail fields (dimensions,
  // EXIF, mime type) are fetched lazily via GET /api/photos/:id.
  const items = db
    .prepare(
      `SELECT p.id, p.current_filename, p.file_size, p.rel_dir,
              COUNT(dm.photo_id) AS dup_count
         FROM photos p
         LEFT JOIN duplicate_group_members dm ON dm.photo_id = p.id
         ${whereSql}
         GROUP BY p.id
        ORDER BY ${SORT_SQL[q.sort]}
        LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: q.limit, offset: q.offset });

  res.json({ total, items });
});

/** GET /api/photos/:id — full metadata for one photo. */
photosRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const photo = getPhotoById(id);
  if (!photo) return res.status(404).json({ error: "not found" });
  res.json(photo);
});

/** GET /api/photos/:id/thumbnail — serves (or lazily generates) the WebP thumbnail. */
photosRouter.get("/:id/thumbnail", async (req, res) => {
  const id = Number(req.params.id);
  const photo = getPhotoById(id);
  if (!photo) return res.status(404).json({ error: "not found" });

  let thumbPath = photo.thumbnail_path;

  if (!thumbPath) {
    let gen = thumbInFlight.get(id);
    if (!gen) {
      gen = makeThumbnail(photo.path, id)
        .finally(() => thumbInFlight.delete(id));
      thumbInFlight.set(id, gen);
    }
    thumbPath = await gen;
    if (thumbPath) updateThumbnailPath(id, thumbPath);
  }

  if (!thumbPath) return res.status(404).json({ error: "thumbnail generation failed" });

  const abs = thumbnailAbsPath(thumbPath);
  // A 0-byte file means a previous run was interrupted mid-write — don't
  // serve it or let the browser cache it; the next request will regenerate.
  let size = -1;
  try {
    size = fs.statSync(abs).size;
  } catch {
    /* missing — handled below */
  }
  if (size <= 0) {
    // Reset the DB so next request regenerates rather than looking for a missing file.
    updateThumbnailPath(id, null);
    return res.status(404).json({ error: "thumbnail missing" });
  }
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(abs);
});

/** PATCH /api/photos/:id/rename — rename the file on disk and update DB. */
photosRouter.patch("/:id/rename", (req, res) => {
  const id = Number(req.params.id);
  const { filename } = req.body as { filename?: string };

  if (!filename || /[/\\]/.test(filename)) {
    return res.status(400).json({ error: "invalid filename" });
  }

  const db = getDb();
  const photo = db
    .prepare("SELECT path FROM photos WHERE id = ?")
    .get(id) as { path: string } | undefined;
  if (!photo) return res.status(404).json({ error: "not found" });

  const dir = path.dirname(photo.path);
  const newPath = path.join(dir, filename);

  if (newPath !== photo.path && fs.existsSync(newPath)) {
    return res.status(409).json({ error: "a file with that name already exists" });
  }

  try {
    fs.renameSync(photo.path, newPath);
  } catch {
    return res.status(500).json({ error: "failed to rename file" });
  }

  db.prepare(
    "UPDATE photos SET current_filename = ?, path = ? WHERE id = ?"
  ).run(filename, newPath, id);

  res.json({ ok: true });
});

/** GET /api/photos/:id/raw — the original full-resolution file. */
photosRouter.get("/:id/raw", (req, res) => {
  const photo = getPhotoById(Number(req.params.id));
  if (!photo) return res.status(404).json({ error: "not found" });
  if (!fs.existsSync(photo.path))
    return res.status(404).json({ error: "file missing" });
  if (req.query.download) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${photo.current_filename}"`
    );
  }
  res.sendFile(photo.path);
});
