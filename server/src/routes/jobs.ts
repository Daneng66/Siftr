import { Router } from "express";
import { jobs } from "../jobs";
import { runThumbnailJob, scanLibrary } from "../scanner";
import { runDedup } from "../dedup/czkawka";

export const jobsRouter = Router();

/** GET /api/jobs — current snapshot (kept for non-SSE consumers). */
jobsRouter.get("/", (_req, res) => {
  res.json(jobs.snapshot());
});

/** GET /api/jobs/stream — SSE stream of job state pushes. */
jobsRouter.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  // Send current state immediately so the client doesn't wait for the first event.
  res.write(`data: ${JSON.stringify(jobs.snapshot())}\n\n`);
  const removeClient = jobs.addSseClient(res);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient();
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
 * After indexing completes, a dedup pass runs automatically (if files changed)
 * and a thumbnail generation pass runs for any photos missing thumbnails.
 */
scanRouter.post("/", (req, res) => {
  if (jobs.isRunning("scan")) {
    return res.status(409).json({ error: "scan already running" });
  }
  const hard = (req.body as { hard?: unknown } | undefined)?.hard === true;
  // Fire and forget; progress for all passes is tracked via the jobs table.
  scanLibrary(hard ? "hard" : "soft")
    .then((result) => {
      const changed = result.added + result.updated + result.removed > 0;
      if (changed && !jobs.isRunning("dedup"))
        runDedup().catch((err) => console.error("[dedup] failed:", err));
      if (!jobs.isRunning("thumb"))
        runThumbnailJob().catch((err) => console.error("[thumb] failed:", err));
    })
    .catch((err) => console.error("[scan] failed:", err));
  res.status(202).json({ started: true });
});
