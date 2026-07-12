import { Router } from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "../config";
import { getDb } from "../db";
import type { PhotoRow } from "../db/photos";
import { applyPathPattern, joinRelDir } from "../organize/pathPattern";
import type { RenameContext } from "../rename/pattern";
import { moveFile } from "../util/fsmove";

export const organizeRouter = Router();

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("folder"), path: z.string().min(1) }),
]);
type Scope = z.infer<typeof scopeSchema>;

const bodySchema = z.object({
  scope: scopeSchema,
  pattern: z.string().min(1),
  customText: z.string().default(""),
  // Only consulted when scope.kind === "all": keep each photo's existing
  // rel_dir as a prefix and reorganize within it, rather than rebuilding the
  // whole tree from the library root.
  retainStructure: z.boolean().default(true),
  // What {date:...} tokens resolve to when a photo has no EXIF date taken:
  //   "unknown"      - leave it null; formatDate() renders "unknown-date".
  //   "fileModified" - fall back to the file's on-disk modified time.
  dateFallback: z.enum(["unknown", "fileModified"]).default("unknown"),
});

interface PlanItem {
  photo: PhotoRow;
  newRelDir: string;
  newFilename: string;
  newRelPath: string;
  /** Absolute destination path, or "" when the pattern resolved to an empty name. */
  absTarget: string;
  conflict: string | null;
}

interface PublicPlanItem {
  photoId: number;
  currentRelPath: string;
  newRelPath: string;
  conflict: string | null;
  unchanged: boolean;
}

function toPublicItem(item: PlanItem): PublicPlanItem {
  return {
    photoId: item.photo.id,
    currentRelPath: joinRelDir(item.photo.rel_dir, item.photo.current_filename),
    newRelPath: item.newRelPath,
    conflict: item.conflict,
    unchanged: item.absTarget === item.photo.path,
  };
}

/** Photos under a scope: the whole library, or a folder plus its descendants. */
function photosInScope(scope: Scope): PhotoRow[] {
  const db = getDb();
  if (scope.kind === "folder") {
    return db
      .prepare(
        `SELECT * FROM photos WHERE rel_dir = @path OR rel_dir LIKE @prefix ORDER BY rel_dir, path`
      )
      .all({ path: scope.path, prefix: `${scope.path}/%` }) as PhotoRow[];
  }
  return db.prepare(`SELECT * FROM photos ORDER BY rel_dir, path`).all() as PhotoRow[];
}

/**
 * Resolve every photo's destination and flag conflicts. Photos are grouped
 * into buckets sharing a "base prefix" — the folder path the pattern is
 * resolved underneath — so `{seq}` numbering and collision detection stay
 * scoped per-folder rather than mixing unrelated groups:
 *   - scope "folder": every photo shares that folder as its base prefix.
 *   - scope "all", retainStructure: each photo's own current rel_dir.
 *   - scope "all", !retainStructure: everything shares the library root ("").
 */
function buildOrganizePlan(
  photos: PhotoRow[],
  pattern: string,
  customText: string,
  scope: Scope,
  retainStructure: boolean,
  dateFallback: "unknown" | "fileModified"
): PlanItem[] {
  const buckets = new Map<string, PhotoRow[]>();
  for (const photo of photos) {
    const basePrefix =
      scope.kind === "folder" ? scope.path : retainStructure ? photo.rel_dir : "";
    const bucket = buckets.get(basePrefix);
    if (bucket) bucket.push(photo);
    else buckets.set(basePrefix, [photo]);
  }

  const items: PlanItem[] = [];
  for (const [basePrefix, group] of buckets) {
    group.forEach((photo, index) => {
      const ext = path.extname(photo.current_filename);
      const ctx: RenameContext = {
        originalName: path.basename(
          photo.original_filename,
          path.extname(photo.original_filename)
        ),
        currentName: path.basename(photo.current_filename, ext),
        dateTaken:
          photo.exif_date_taken ??
          (dateFallback === "fileModified" ? photo.date_modified : null),
        cameraModel: photo.exif_camera_model,
        index,
        customText,
      };
      const resolved = applyPathPattern(pattern, ctx);
      const newRelDir = joinRelDir(basePrefix, ...resolved.dirSegments);
      const newFilename = resolved.base ? `${resolved.base}${ext}` : "";
      const newRelPath = newFilename ? joinRelDir(newRelDir, newFilename) : "";
      const absTarget = newFilename
        ? path.join(config.photosDir, newRelDir, newFilename)
        : "";
      items.push({ photo, newRelDir, newFilename, newRelPath, absTarget, conflict: null });
    });
  }

  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.absTarget) continue;
    const key = item.absTarget.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const item of items) {
    if (!item.newFilename) {
      item.conflict = "empty name";
      continue;
    }
    const key = item.absTarget.toLowerCase();
    if ((counts.get(key) ?? 0) > 1) {
      item.conflict = "duplicate target path in plan";
    } else if (item.absTarget !== item.photo.path && fs.existsSync(item.absTarget)) {
      item.conflict = "a file already exists at the destination";
    }
  }
  return items;
}

/** Remove directories left empty by moves, walking up toward (but never past) the photos root. */
async function cleanupEmptyDirs(startDirs: Iterable<string>): Promise<void> {
  const root = path.resolve(config.photosDir);
  for (const start of startDirs) {
    let dir = path.resolve(start);
    while (dir !== root && dir.startsWith(root + path.sep)) {
      let entries: string[];
      try {
        entries = await fsp.readdir(dir);
      } catch {
        break;
      }
      if (entries.length > 0) break;
      try {
        await fsp.rmdir(dir);
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
  }
}

/** POST /api/organize/preview — dry run, no disk changes. */
organizeRouter.post("/preview", (req, res) => {
  const body = bodySchema.parse(req.body);
  const photos = photosInScope(body.scope);
  const items = buildOrganizePlan(
    photos,
    body.pattern,
    body.customText,
    body.scope,
    body.retainStructure,
    body.dateFallback
  );
  const plan = items.map(toPublicItem);
  res.json({
    plan,
    hasConflicts: items.some((i) => i.conflict),
    totalPhotos: photos.length,
    moving: plan.filter((p) => !p.unchanged && !p.conflict).length,
  });
});

/** POST /api/organize/apply — move files on disk into the new structure and update the index. */
organizeRouter.post("/apply", async (req, res) => {
  const body = bodySchema.parse(req.body);
  const photos = photosInScope(body.scope);
  const items = buildOrganizePlan(
    photos,
    body.pattern,
    body.customText,
    body.scope,
    body.retainStructure,
    body.dateFallback
  );
  if (items.some((i) => i.conflict)) {
    return res
      .status(400)
      .json({ error: "conflicts present", plan: items.map(toPublicItem), hasConflicts: true });
  }

  const db = getDb();
  const update = db.prepare(
    `UPDATE photos SET path = ?, rel_dir = ?, current_filename = ? WHERE id = ?`
  );
  const sourceDirs = new Set<string>();
  let moved = 0;
  for (const item of items) {
    if (item.absTarget === item.photo.path) continue;
    sourceDirs.add(path.dirname(item.photo.path));
    await fsp.mkdir(path.dirname(item.absTarget), { recursive: true });
    await moveFile(item.photo.path, item.absTarget);
    update.run(item.absTarget, item.newRelDir, item.newFilename, item.photo.id);
    moved++;
  }
  await cleanupEmptyDirs(sourceDirs);

  res.json({ moved, plan: items.map(toPublicItem) });
});
