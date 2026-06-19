import { Router } from "express";
import { jobs } from "../jobs";
import { scanLibrary } from "../scanner";

export const jobsRouter = Router();

/** GET /api/jobs — recent jobs for progress polling. */
jobsRouter.get("/", (_req, res) => {
  res.json({
    jobs: jobs.recent(),
    scanRunning: jobs.isRunning("scan"),
    dedupRunning: jobs.isRunning("dedup"),
  });
});

/** GET /api/jobs/:id — single job status. */
jobsRouter.get("/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "not found" });
  res.json(job);
});

export const scanRouter = Router();

/** POST /api/scan — kick off a library scan (rejects if one is already running). */
scanRouter.post("/", (_req, res) => {
  if (jobs.isRunning("scan")) {
    return res.status(409).json({ error: "scan already running" });
  }
  // Fire and forget; progress is tracked via the jobs table.
  scanLibrary().catch((err) => console.error("[scan] failed:", err));
  res.status(202).json({ started: true });
});
