import { Router } from "express";
import fsp from "node:fs/promises";
import { z } from "zod";
import { jobs } from "../jobs";
import { runDedup } from "../dedup/czkawka";
import {
  getMembersMarkedForDeletion,
  listGroups,
  setMemberStatus,
} from "../db/duplicates";
import { getPhotoById, deletePhotoById } from "../db/photos";
import { deleteThumbnail } from "../scanner/thumbnails";
import { moveToTrash } from "../util/trash";
import { getDb } from "../db";

export const duplicatesRouter = Router();

/** POST /api/duplicates/scan — run czkawka exact + similar passes (async). */
duplicatesRouter.post("/scan", (_req, res) => {
  if (jobs.isRunning("dedup"))
    return res.status(409).json({ error: "dedup already running" });
  runDedup().catch((err) => console.error("[dedup] failed:", err));
  res.status(202).json({ started: true });
});

/** GET /api/duplicates?kind=exact|similar — groups with member summaries. */
duplicatesRouter.get("/", (req, res) => {
  const kind = req.query.kind;
  const groups = listGroups(
    kind === "exact" || kind === "similar" ? kind : undefined
  );
  res.json({ groups });
});

const resolveSchema = z.object({
  statuses: z
    .array(
      z.object({
        photoId: z.number(),
        status: z.enum(["kept", "recommended", "marked_for_deletion", "ignored"]),
      })
    )
    .min(1),
});

/** POST /api/duplicates/:groupId/resolve — set per-member keep/delete status. */
duplicatesRouter.post("/:groupId/resolve", (req, res) => {
  const groupId = Number(req.params.groupId);
  const { statuses } = resolveSchema.parse(req.body);
  for (const s of statuses) setMemberStatus(groupId, s.photoId, s.status);
  res.json({ updated: statuses.length });
});

const applySchema = z.object({
  groupId: z.number().optional(),
  permanent: z.boolean().optional(),
});

/**
 * POST /api/duplicates/apply — move every member marked_for_deletion to .trash
 * (or delete permanently when permanent=true), remove from index, drop trivial groups.
 * Optionally scoped to one group.
 */
duplicatesRouter.post("/apply", async (req, res) => {
  const { groupId, permanent } = applySchema.parse(req.body ?? {});
  const db = getDb();
  const groupIds: number[] = groupId
    ? [groupId]
    : (
        db.prepare(`SELECT id FROM duplicate_groups`).all() as Array<{
          id: number;
        }>
      ).map((g) => g.id);

  let deleted = 0;
  for (const gid of groupIds) {
    const members = getMembersMarkedForDeletion(gid);
    for (const m of members) {
      const photo = getPhotoById(m.photo_id);
      if (!photo) continue;
      try {
        if (permanent) {
          await fsp.unlink(photo.path);
        } else {
          await moveToTrash(photo.path);
        }
      } catch (err) {
        console.error("[dedup] delete failed for", photo.path, err);
        continue;
      }
      deletePhotoById(photo.id); // cascades out of group membership
      await deleteThumbnail(photo.id); // don't leave the thumbnail orphaned
      deleted++;
    }
    // Drop groups that no longer have >= 2 members.
    const remaining = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM duplicate_group_members WHERE group_id = ?`
        )
        .get(gid) as { n: number }
    ).n;
    if (remaining < 2)
      db.prepare(`DELETE FROM duplicate_groups WHERE id = ?`).run(gid);
  }
  res.json({ deleted });
});
