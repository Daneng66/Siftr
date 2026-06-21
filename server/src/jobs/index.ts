import crypto from "node:crypto";
import type { Response } from "express";
import { getDb } from "../db";
import { invalidateStatsCache } from "../db/statsCache";

export type JobType = "scan" | "dedup" | "thumb";
export type JobStatus = "running" | "completed" | "failed";

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  total: number;
  message: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Tracks long-running work (scans, dedup) in the `jobs` table so the frontend can
 * poll progress. A simple in-memory guard prevents two scans (or two dedups) from
 * overlapping.
 */
class JobManager {
  private active = new Map<JobType, string>();
  private sseClients = new Set<Response>();
  // True for the full duration of a *hard* scan job (clear → rebuild complete).
  // A hard scan wipes the index, so the UI hides images and stats until it ends.
  private hardScanActive = false;

  isRunning(type: JobType): boolean {
    return this.active.has(type);
  }

  snapshot() {
    return {
      jobs: this.recent(),
      scanRunning: this.isRunning("scan"),
      dedupRunning: this.isRunning("dedup"),
      thumbRunning: this.isRunning("thumb"),
      hardScanRunning: this.hardScanActive,
    };
  }

  addSseClient(res: Response): () => void {
    this.sseClients.add(res);
    return () => this.sseClients.delete(res);
  }

  private broadcast(): void {
    if (this.sseClients.size === 0) return;
    const payload = `data: ${JSON.stringify(this.snapshot())}\n\n`;
    for (const res of this.sseClients) res.write(payload);
  }

  /**
   * Mark any jobs left in the DB as `running` as failed. On a fresh boot the
   * in-memory `active` map is empty, so such rows are orphans from a process
   * that died/restarted mid-job and can never be finished. Call once at startup
   * before kicking off new work, otherwise they show as perpetually "running"
   * in the UI.
   */
  reconcileOnStartup(): number {
    const info = getDb()
      .prepare(
        `UPDATE jobs
            SET status = 'failed',
                error = 'interrupted by server restart',
                updated_at = datetime('now')
          WHERE status = 'running'`
      )
      .run();
    return info.changes;
  }

  create(type: JobType, message = "", opts: { hard?: boolean } = {}): Job {
    const id = crypto.randomUUID();
    getDb()
      .prepare(
        `INSERT INTO jobs (id, type, status, progress, total, message)
         VALUES (?, ?, 'running', 0, 0, ?)`
      )
      .run(id, type, message);
    this.active.set(type, id);
    if (type === "scan" && opts.hard) this.hardScanActive = true;
    const job = this.get(id)!;
    this.broadcast();
    return job;
  }

  update(
    id: string,
    fields: Partial<Pick<Job, "progress" | "total" | "message">>
  ): void {
    const current = this.get(id);
    if (!current) return;
    getDb()
      .prepare(
        `UPDATE jobs
            SET progress = ?, total = ?, message = ?, updated_at = datetime('now')
          WHERE id = ?`
      )
      .run(
        fields.progress ?? current.progress,
        fields.total ?? current.total,
        fields.message ?? current.message,
        id
      );
    this.broadcast();
  }

  finish(id: string, type: JobType, error?: string): void {
    getDb()
      .prepare(
        `UPDATE jobs
            SET status = ?, error = ?, updated_at = datetime('now')
          WHERE id = ?`
      )
      .run(error ? "failed" : "completed", error ?? null, id);
    if (this.active.get(type) === id) this.active.delete(type);
    if (type === "scan") this.hardScanActive = false;
    // A finished scan/dedup changed the library, so any cached stats are stale —
    // drop them so the client's post-completion refetch gets fresh counts.
    if (type === "scan" || type === "dedup") invalidateStatsCache();
    this.broadcast();
  }

  get(id: string): Job | undefined {
    return getDb().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as
      | Job
      | undefined;
  }

  recent(limit = 20): Job[] {
    return getDb()
      .prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Job[];
  }
}

export const jobs = new JobManager();
