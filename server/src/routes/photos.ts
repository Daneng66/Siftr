import { Router } from "express";
import fs from "node:fs";
import { z } from "zod";
import { getDb } from "../db";
import { getPhotoById } from "../db/photos";
import { thumbnailAbsPath } from "../scanner/thumbnails";

export const photosRouter = Router();

const listQuery = z.object({
  folderId: z.string().optional(), // number | "none"
  favorite: z.coerce.boolean().optional(),
  tagId: z.coerce.number().optional(),
  duplicatesOnly: z.coerce.boolean().optional(),
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

  if (q.folderId === "none") {
    where.push("p.folder_id IS NULL");
  } else if (q.folderId !== undefined) {
    where.push("p.folder_id = @folderId");
    params.folderId = Number(q.folderId);
  }
  if (q.favorite) where.push("p.is_favorite = 1");
  if (q.tagId !== undefined) {
    where.push(
      "EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id AND pt.tag_id = @tagId)"
    );
    params.tagId = q.tagId;
  }
  if (q.duplicatesOnly) {
    where.push(
      "EXISTS (SELECT 1 FROM duplicate_group_members dm WHERE dm.photo_id = p.id)"
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

  const items = db
    .prepare(
      `SELECT p.id, p.current_filename, p.file_size, p.width, p.height,
              p.mime_type, p.exif_date_taken, p.thumbnail_path, p.is_favorite,
              p.folder_id,
              (SELECT COUNT(*) FROM photo_tags pt WHERE pt.photo_id = p.id) AS tag_count,
              (SELECT COUNT(*) FROM duplicate_group_members dm WHERE dm.photo_id = p.id) AS dup_count
         FROM photos p
         ${whereSql}
        ORDER BY ${SORT_SQL[q.sort]}
        LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: q.limit, offset: q.offset });

  res.json({ total, items });
});

/** GET /api/photos/:id — full metadata for one photo (incl. tags). */
photosRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const photo = getPhotoById(id);
  if (!photo) return res.status(404).json({ error: "not found" });
  const tags = getDb()
    .prepare(
      `SELECT t.id, t.name FROM tags t
         JOIN photo_tags pt ON pt.tag_id = t.id
        WHERE pt.photo_id = ? ORDER BY t.name`
    )
    .all(id);
  res.json({ ...photo, tags });
});

/** GET /api/photos/:id/thumbnail — the cached WebP thumbnail. */
photosRouter.get("/:id/thumbnail", (req, res) => {
  const photo = getPhotoById(Number(req.params.id));
  if (!photo?.thumbnail_path)
    return res.status(404).json({ error: "no thumbnail" });
  const abs = thumbnailAbsPath(photo.thumbnail_path);
  if (!fs.existsSync(abs))
    return res.status(404).json({ error: "thumbnail missing" });
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(abs);
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

/** PATCH /api/photos/:id/favorite — toggle/set favorite flag. */
photosRouter.patch("/:id/favorite", (req, res) => {
  const id = Number(req.params.id);
  const photo = getPhotoById(id);
  if (!photo) return res.status(404).json({ error: "not found" });
  const value =
    typeof req.body?.favorite === "boolean"
      ? req.body.favorite
        ? 1
        : 0
      : photo.is_favorite
      ? 0
      : 1;
  getDb().prepare(`UPDATE photos SET is_favorite = ? WHERE id = ?`).run(value, id);
  res.json({ id, is_favorite: value });
});
