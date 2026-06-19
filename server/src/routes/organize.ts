import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";

export const organizeRouter = Router();

/** Find a folder by (name, parent) or create it. */
function findOrCreateFolder(name: string, parentId: number | null): number {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM folders WHERE name = ? AND parent_id IS ?`
    )
    .get(name, parentId) as { id: number } | undefined;
  if (existing) return existing.id;
  return db
    .prepare(`INSERT INTO folders (name, parent_id) VALUES (?, ?)`)
    .run(name, parentId).lastInsertRowid as number;
}

const moveSchema = z.object({
  photoIds: z.array(z.number()).min(1),
  folderId: z.number().nullable(),
});

/** POST /api/organize/move — manually assign photos to a folder (or unfile). */
organizeRouter.post("/move", (req, res) => {
  const { photoIds, folderId } = moveSchema.parse(req.body);
  const db = getDb();
  const stmt = db.prepare(`UPDATE photos SET folder_id = ? WHERE id = ?`);
  const tx = db.transaction((ids: number[]) => {
    for (const id of ids) stmt.run(folderId, id);
  });
  tx(photoIds);
  res.json({ moved: photoIds.length, folderId });
});

const autoSchema = z.object({
  rule: z.enum(["date-year", "date-month", "camera", "location"]),
  photoIds: z.array(z.number()).optional(), // omitted => entire library
});

interface ScopedPhoto {
  id: number;
  exif_date_taken: string | null;
  exif_camera_model: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
}

/** POST /api/organize/auto — assign folders by a rule (virtual; no file moves). */
organizeRouter.post("/auto", (req, res) => {
  const { rule, photoIds } = autoSchema.parse(req.body);
  const db = getDb();
  const photos = (
    photoIds && photoIds.length
      ? db
          .prepare(
            `SELECT id, exif_date_taken, exif_camera_model, gps_lat, gps_lon
               FROM photos WHERE id IN (${photoIds.map(() => "?").join(",")})`
          )
          .all(...photoIds)
      : db
          .prepare(
            `SELECT id, exif_date_taken, exif_camera_model, gps_lat, gps_lon FROM photos`
          )
          .all()
  ) as ScopedPhoto[];

  const assign = db.prepare(`UPDATE photos SET folder_id = ? WHERE id = ?`);
  let assigned = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    for (const p of photos) {
      let folderId: number | null = null;
      if (rule === "date-year" || rule === "date-month") {
        if (!p.exif_date_taken) {
          skipped++;
          continue;
        }
        const d = new Date(p.exif_date_taken);
        if (isNaN(d.getTime())) {
          skipped++;
          continue;
        }
        const yearId = findOrCreateFolder(String(d.getFullYear()), null);
        if (rule === "date-month") {
          const month = String(d.getMonth() + 1).padStart(2, "0");
          folderId = findOrCreateFolder(month, yearId);
        } else {
          folderId = yearId;
        }
      } else if (rule === "camera") {
        const name = p.exif_camera_model?.trim() || "Unknown Camera";
        folderId = findOrCreateFolder(name, null);
      } else if (rule === "location") {
        if (p.gps_lat == null || p.gps_lon == null) {
          skipped++;
          continue;
        }
        // Coarse bucket: 1-degree grid cell.
        const name = `${Math.round(p.gps_lat)}, ${Math.round(p.gps_lon)}`;
        const root = findOrCreateFolder("Located", null);
        folderId = findOrCreateFolder(name, root);
      }
      if (folderId != null) {
        assign.run(folderId, p.id);
        assigned++;
      }
    }
  });
  tx();

  res.json({ assigned, skipped });
});
