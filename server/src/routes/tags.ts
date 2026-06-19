import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";

export const tagsRouter = Router();

/** GET /api/tags — all tags with photo counts. */
tagsRouter.get("/", (_req, res) => {
  const tags = getDb()
    .prepare(
      `SELECT t.id, t.name,
              (SELECT COUNT(*) FROM photo_tags pt WHERE pt.tag_id = t.id) AS photo_count
         FROM tags t ORDER BY t.name COLLATE NOCASE`
    )
    .all();
  res.json({ tags });
});

const createSchema = z.object({ name: z.string().min(1).max(60) });

tagsRouter.post("/", (req, res) => {
  const { name } = createSchema.parse(req.body);
  const db = getDb();
  db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(name);
  const tag = db.prepare(`SELECT id, name FROM tags WHERE name = ?`).get(name);
  res.status(201).json(tag);
});

tagsRouter.delete("/:id", (req, res) => {
  getDb().prepare(`DELETE FROM tags WHERE id = ?`).run(Number(req.params.id));
  res.json({ deleted: true });
});

const assignSchema = z.object({
  photoIds: z.array(z.number()).min(1),
  tagId: z.number().optional(),
  tagName: z.string().min(1).max(60).optional(),
});

/** POST /api/tags/assign — tag a set of photos (creates the tag if a name given). */
tagsRouter.post("/assign", (req, res) => {
  const { photoIds, tagId, tagName } = assignSchema.parse(req.body);
  const db = getDb();
  let id = tagId;
  if (!id && tagName) {
    db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(tagName);
    id = (db.prepare(`SELECT id FROM tags WHERE name = ?`).get(tagName) as {
      id: number;
    }).id;
  }
  if (!id) return res.status(400).json({ error: "tagId or tagName required" });

  const insert = db.prepare(
    `INSERT OR IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)`
  );
  const tx = db.transaction((ids: number[]) => {
    for (const pid of ids) insert.run(pid, id);
  });
  tx(photoIds);
  res.json({ tagId: id, assigned: photoIds.length });
});

/** POST /api/tags/unassign — remove a tag from a set of photos. */
tagsRouter.post("/unassign", (req, res) => {
  const { photoIds, tagId } = z
    .object({ photoIds: z.array(z.number()).min(1), tagId: z.number() })
    .parse(req.body);
  const db = getDb();
  const del = db.prepare(
    `DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?`
  );
  const tx = db.transaction((ids: number[]) => {
    for (const pid of ids) del.run(pid, tagId);
  });
  tx(photoIds);
  res.json({ removed: photoIds.length });
});
