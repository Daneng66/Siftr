import crypto from "node:crypto";
import { getDb } from "../db";

export type JobType = "scan" | "dedup";
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

  isRunning(type: JobType): boolean {
    return this.active.has(type);
  }

  create(type: JobType, message = ""): Job {
    const id = crypto.randomUUID();
    getDb()
      .prepare(
        `INSERT INTO jobs (id, type, status, progress, total, message)
         VALUES (?, ?, 'running', 0, 0, ?)`
      )
      .run(id, type, message);
    this.active.set(type, id);
    return this.get(id)!;
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
