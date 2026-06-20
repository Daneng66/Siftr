import { Router } from "express";
import { getDb } from "../db";
import { getCachedStats, setCachedStats } from "../db/statsCache";
import { jobs } from "../jobs";

export const statsRouter = Router();

/** GET /api/stats — library summary for the sidebar. */
statsRouter.get("/", (_req, res) => {
  // While a scan or dedup is running the library is changing every batch, so the
  // client polls for live counts — serve fresh numbers rather than cached ones.
  const scanning = jobs.isRunning("scan") || jobs.isRunning("dedup");
  const cached = scanning ? null : getCachedStats();
  if (cached) return res.json(cached);

  const db = getDb();
  const photos = (db.prepare(`SELECT COUNT(*) AS n FROM photos`).get() as { n: number }).n;
  const totalSize = (
    db.prepare(`SELECT COALESCE(SUM(file_size),0) AS n FROM photos`).get() as { n: number }
  ).n;
  const folders = (
    db
      .prepare(`SELECT COUNT(DISTINCT rel_dir) AS n FROM photos WHERE rel_dir <> ''`)
      .get() as { n: number }
  ).n;
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

  const data = {
    photos,
    totalSize,
    folders,
    duplicateCount: dup.count,
    reclaimableSize: dup.size,
  };

  // Only cache when idle; mid-scan values are bypassed anyway and would be stale.
  if (!scanning) setCachedStats(data);
  res.json(data);
});
