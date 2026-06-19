import { Router } from "express";
import { z } from "zod";
import { getPhotoById } from "../db/photos";
import { writeExif, type ExifEdits } from "../exif/write";
import { reindexFile } from "../scanner";

export const metadataRouter = Router();

const editsSchema = z.object({
  dateTaken: z.string().nullable().optional(),
  gpsLat: z.number().nullable().optional(),
  gpsLon: z.number().nullable().optional(),
  cameraMake: z.string().nullable().optional(),
  cameraModel: z.string().nullable().optional(),
});

async function applyToPhotos(ids: number[], edits: ExifEdits): Promise<number> {
  const photos = ids
    .map((id) => getPhotoById(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (photos.length === 0) return 0;
  await writeExif(
    photos.map((p) => p.path),
    edits
  );
  // Re-index so the SQLite copy matches the freshly-written file bytes.
  for (const p of photos) await reindexFile(p.path);
  return photos.length;
}

/** PATCH /api/metadata/:id — edit one photo's EXIF (writes to the file). */
metadataRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const edits = editsSchema.parse(req.body);
  const updated = await applyToPhotos([id], edits);
  if (updated === 0) return res.status(404).json({ error: "not found" });
  res.json({ updated, photo: getPhotoById(id) });
});

const bulkSchema = z.object({
  photoIds: z.array(z.number()).min(1),
  edits: editsSchema,
});

/** POST /api/metadata/bulk — edit EXIF across a selection. */
metadataRouter.post("/bulk", async (req, res) => {
  const { photoIds, edits } = bulkSchema.parse(req.body);
  const updated = await applyToPhotos(photoIds, edits);
  res.json({ updated });
});
