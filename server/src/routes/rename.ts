import { Router } from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getDb } from "../db";
import { getPhotoById, type PhotoRow } from "../db/photos";
import { applyPattern, type RenameContext } from "../rename/pattern";

export const renameRouter = Router();

const schema = z.object({
  photoIds: z.array(z.number()).min(1),
  pattern: z.string().min(1),
  customText: z.string().default(""),
});

interface PlanItem {
  photoId: number;
  currentName: string;
  newName: string;
  conflict: string | null;
}

/** Compute the rename plan (new names + conflict detection) for a selection. */
function buildPlan(
  photos: PhotoRow[],
  pattern: string,
  customText: string
): PlanItem[] {
  const seenInBatch = new Map<string, number>(); // lowercased newPath -> count
  const plan: PlanItem[] = [];

  photos.forEach((photo, index) => {
    const ext = path.extname(photo.current_filename);
    const ctx: RenameContext = {
      originalName: path.basename(
        photo.original_filename,
        path.extname(photo.original_filename)
      ),
      currentName: path.basename(photo.current_filename, ext),
      dateTaken: photo.exif_date_taken,
      cameraModel: photo.exif_camera_model,
      index,
      customText,
    };
    const base = applyPattern(pattern, ctx);
    const newName = base ? `${base}${ext}` : "";
    const dir = path.dirname(photo.path);
    const newPath = path.join(dir, newName);
    const key = newPath.toLowerCase();
    seenInBatch.set(key, (seenInBatch.get(key) ?? 0) + 1);
    plan.push({
      photoId: photo.id,
      currentName: photo.current_filename,
      newName,
      conflict: null,
    });
  });

  // Second pass: flag conflicts now that batch counts are known.
  for (const item of plan) {
    const photo = photos.find((p) => p.id === item.photoId)!;
    const dir = path.dirname(photo.path);
    const newPath = path.join(dir, item.newName);
    const key = newPath.toLowerCase();
    if (!item.newName) {
      item.conflict = "empty name";
    } else if ((seenInBatch.get(key) ?? 0) > 1) {
      item.conflict = "duplicate name in selection";
    } else if (newPath !== photo.path && fs.existsSync(newPath)) {
      item.conflict = "a file with this name already exists";
    }
  }
  return plan;
}

function loadPhotos(ids: number[]): PhotoRow[] {
  return ids
    .map((id) => getPhotoById(id))
    .filter((p): p is PhotoRow => Boolean(p));
}

/** POST /api/rename/preview — dry run, no disk changes. */
renameRouter.post("/preview", (req, res) => {
  const { photoIds, pattern, customText } = schema.parse(req.body);
  const plan = buildPlan(loadPhotos(photoIds), pattern, customText);
  res.json({ plan, hasConflicts: plan.some((p) => p.conflict) });
});

/** POST /api/rename/apply — rename files on disk and update the index. */
renameRouter.post("/apply", async (req, res) => {
  const { photoIds, pattern, customText } = schema.parse(req.body);
  const photos = loadPhotos(photoIds);
  const plan = buildPlan(photos, pattern, customText);
  if (plan.some((p) => p.conflict)) {
    return res
      .status(400)
      .json({ error: "conflicts present", plan, hasConflicts: true });
  }

  const db = getDb();
  const update = db.prepare(
    `UPDATE photos SET path = ?, current_filename = ? WHERE id = ?`
  );
  let renamed = 0;
  for (const item of plan) {
    const photo = photos.find((p) => p.id === item.photoId)!;
    if (item.newName === photo.current_filename) continue;
    const newPath = path.join(path.dirname(photo.path), item.newName);
    await fsp.rename(photo.path, newPath);
    update.run(newPath, item.newName, photo.id);
    renamed++;
  }
  res.json({ renamed, plan });
});
