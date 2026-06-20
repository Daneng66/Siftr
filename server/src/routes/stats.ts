import { Router } from "express";
import { getDb } from "../db";

export const statsRouter = Router();

/** GET /api/stats — library summary for the sidebar. */
statsRouter.get("/", (_req, res) => {
  const db = getDb();
  const photos = (db.prepare(`SELECT COUNT(*) AS n FROM photos`).get() as {
    n: number;
  }).n;
  const totalSize = (
    db.prepare(`SELECT COALESCE(SUM(file_size),0) AS n FROM photos`).get() as {
      n: number;
    }
  ).n;
  const folders = (
    db
      .prepare(`SELECT COUNT(DISTINCT rel_dir) AS n FROM photos WHERE rel_dir <> ''`)
      .get() as { n: number }
  ).n;
  // Redundant copies and the storage they occupy: per group we assume one copy
  // is kept (the largest), so the rest are reclaimable if removed.
  const dup = db
    .prepare(
      `WITH g AS (
         SELECT COUNT(*) AS cnt,
                SUM(p.file_size) AS total,
                MAX(p.file_size) AS keep
         FROM duplicate_group_members m
         JOIN photos p ON p.id = m.photo_id
         GROUP BY m.group_id
       )
       SELECT COALESCE(SUM(cnt - 1), 0) AS count,
              COALESCE(SUM(total - keep), 0) AS size
       FROM g`
    )
    .get() as { count: number; size: number };

  res.json({
    photos,
    totalSize,
    folders,
    duplicateCount: dup.count,
    reclaimableSize: dup.size,
  });
});
