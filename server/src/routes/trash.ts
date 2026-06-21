import { Router } from "express";
import { getTrashStats, restoreAll, emptyTrash } from "../util/trash";
import { jobs } from "../jobs";
import { scanLibrary } from "../scanner";
import { runDedup } from "../dedup/czkawka";

export const trashRouter = Router();

/** GET /api/trash — number of files and total size (bytes) in the trash. */
trashRouter.get("/", async (_req, res) => {
  res.json(await getTrashStats());
});

/**
 * POST /api/trash/restore — move every trashed file back to its original folder,
 * then kick off a soft scan so the restored files get re-indexed (chaining a
 * duplicate scan on once indexing completes, the same as a manual scan).
 */
trashRouter.post("/restore", async (_req, res) => {
  const restored = await restoreAll();
  if (restored > 0 && !jobs.isRunning("scan")) {
    scanLibrary("soft")
      .then((result) => {
        const changed = result.added + result.updated + result.removed > 0;
        if (changed && !jobs.isRunning("dedup"))
          runDedup().catch((err) => console.error("[dedup] failed:", err));
      })
      .catch((err) => console.error("[scan] failed:", err));
  }
  res.json({ restored });
});

/** POST /api/trash/empty — permanently delete everything in the trash. */
trashRouter.post("/empty", async (_req, res) => {
  const deleted = await emptyTrash();
  res.json({ deleted });
});
