import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";

export const foldersRouter = Router();

/** GET /api/folders — flat list with photo counts; the client builds the tree. */
foldersRouter.get("/", (_req, res) => {
  const folders = getDb()
    .prepare(
      `SELECT f.id, f.name, f.parent_id,
              (SELECT COUNT(*) FROM photos p WHERE p.folder_id = f.id) AS photo_count
         FROM folders f ORDER BY f.name COLLATE NOCASE`
    )
    .all();
  res.json({ folders });
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.number().nullable().optional(),
});

foldersRouter.post("/", (req, res) => {
  const { name, parentId } = createSchema.parse(req.body);
  const info = getDb()
    .prepare(`INSERT INTO folders (name, parent_id) VALUES (?, ?)`)
    .run(name, parentId ?? null);
  res.status(201).json({ id: info.lastInsertRowid, name, parent_id: parentId ?? null });
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  parentId: z.number().nullable().optional(),
});

foldersRouter.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const body = updateSchema.parse(req.body);
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM folders WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: "not found" });
  if (body.parentId === id)
    return res.status(400).json({ error: "folder cannot be its own parent" });
  if (body.name !== undefined)
    db.prepare(`UPDATE folders SET name = ? WHERE id = ?`).run(body.name, id);
  if (body.parentId !== undefined)
    db.prepare(`UPDATE folders SET parent_id = ? WHERE id = ?`).run(
      body.parentId,
      id
    );
  res.json(db.prepare(`SELECT * FROM folders WHERE id = ?`).get(id));
});

foldersRouter.delete("/:id", (req, res) => {
  getDb().prepare(`DELETE FROM folders WHERE id = ?`).run(Number(req.params.id));
  res.json({ deleted: true });
});
