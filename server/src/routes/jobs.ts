import { Router } from "express";
import { jobs } from "../jobs";
import { scanLibrary } from "../scanner";
import { runDedup } from "../dedup/czkawka";
import { generateThumbnails } from "../scanner/thumbnails";

export const jobsRouter = Router();

/** GET /api/jobs — recent jobs for progress polling. */
jobsRouter.get("/", (_req, res) => {
  res.json({
    jobs: jobs.recent(),
    scanRunning: jobs.isRunning("scan"),
    dedupRunning: jobs.isRunning("dedup"),
    thumbRunning: jobs.isRunning("thumb"),
  });
});

/** GET /api/jobs/:id — single job status. */
jobsRouter.get("/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "not found" });
  res.json(job);
});

export const scanRouter = Router();

/**
 * POST /api/scan — kick off a library scan (rejects if one is already running).
 * Body `{ hard: true }` clears all indexed data and thumbnails before rebuilding.
 * A duplicate scan is chained on automatically once indexing completes, so the
 * main scan keeps duplicate groups in sync without a separate user action.
 */
scanRouter.post("/", (req, res) => {
  if (jobs.isRunning("scan")) {
    return res.status(409).json({ error: "scan already running" });
  }
  const hard = (req.body as { hard?: unknown } | undefined)?.hard === true;
  // Fire and forget; progress for both passes is tracked via the jobs table.
  scanLibrary({ hard })
    .then((result) => {
      const changed = result.added + result.updated + result.removed > 0;
      if (changed && !jobs.isRunning("dedup"))
        runDedup().catch((err) => console.error("[dedup] failed:", err));
      generateThumbnails().catch((err) =>
        console.error("[thumb] failed:", err)
      );
    })
    .catch((err) => console.error("[scan] failed:", err));
  res.status(202).json({ started: true });
});
