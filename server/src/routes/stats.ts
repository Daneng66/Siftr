import { Router } from "express";
import { getDb } from "../db";

export const statsRouter = Router();

/** GET /api/stats — library summary for the sidebar. */
statsRouter.get("/", (_req, res) => {
  const db = getDb();
  const photos = (db.prepare(`SELECT COUNT(*) AS n FROM photos`).get() as {
    n: number;
  }).n;
  const favorites = (
    db.prepare(`SELECT COUNT(*) AS n FROM photos WHERE is_favorite = 1`).get() as {
      n: number;
    }
  ).n;
  const totalSize = (
    db.prepare(`SELECT COALESCE(SUM(file_size),0) AS n FROM photos`).get() as {
      n: number;
    }
  ).n;
  const folders = (db.prepare(`SELECT COUNT(*) AS n FROM folders`).get() as {
    n: number;
  }).n;
  const tags = (db.prepare(`SELECT COUNT(*) AS n FROM tags`).get() as {
    n: number;
  }).n;
  const duplicateGroups = (
    db.prepare(`SELECT COUNT(*) AS n FROM duplicate_groups`).get() as {
      n: number;
    }
  ).n;

  res.json({ photos, favorites, totalSize, folders, tags, duplicateGroups });
});
