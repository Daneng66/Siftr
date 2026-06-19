import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { config } from "../config";
import { parseDuplicatesJson, parseImagesJson } from "./parser";
import { getIndexedPaths } from "../db/photos";
import {
  DupKind,
  GroupMemberInput,
  replaceGroups,
} from "../db/duplicates";
import { jobs } from "../jobs";

/**
 * Normalize a filesystem path for matching czkawka output against indexed paths:
 * unify slashes, and (on Windows, which is case-insensitive) lowercase. Linux
 * paths keep their case so genuinely distinct case-sensitive files stay distinct.
 */
function normalizePath(p: string): string {
  const slashed = p.replace(/\\/g, "/");
  return process.platform === "win32" ? slashed.toLowerCase() : slashed;
}

function run(
  bin: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        // czkawka exits non-zero in some "found duplicates" cases; rely on the
        // results file rather than the exit code, but surface spawn errors.
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          return reject(
            new Error(
              `czkawka_cli not found (looked for "${bin}"). Set CZKAWKA_BIN or install it.`
            )
          );
        }
        resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
      }
    );
  });
}

/**
 * Build czkawka args for a kind, writing compact JSON (`-C`). Verified against
 * czkawka_cli 7.0.0; `-d` directories, `-m` min size, `-s` similarity preset.
 */
function buildArgs(kind: DupKind, outFile: string): string[] {
  if (kind === "exact") {
    return ["dup", "-d", config.photosDir, "-m", "1024", "-C", outFile];
  }
  return [
    "image",
    "-d",
    config.photosDir,
    "-s",
    config.czkawkaImagePreset,
    "-C",
    outFile,
  ];
}

async function scanKind(kind: DupKind): Promise<GroupMemberInput[][]> {
  const outFile = path.join(
    os.tmpdir(),
    `siftr-czkawka-${kind}-${Date.now()}.json`
  );
  try {
    await run(config.czkawkaBin, buildArgs(kind, outFile));
    let text = "";
    try {
      text = await fsp.readFile(outFile, "utf8");
    } catch {
      text = ""; // no results file => no duplicates found
    }
    const parsed =
      kind === "exact" ? parseDuplicatesJson(text) : parseImagesJson(text);

    // Map indexed photos by a normalized path so czkawka's output matches
    // regardless of slash direction / case. czkawka lowercases Windows paths,
    // while the scanner stores them proper-case — exact matching would miss them.
    const byNorm = new Map<string, { id: number; size: number }>();
    for (const [p, v] of getIndexedPaths()) {
      byNorm.set(normalizePath(p), { id: v.id, size: v.size_seen });
    }

    const groups: GroupMemberInput[][] = [];
    for (const group of parsed) {
      const members: GroupMemberInput[] = [];
      let largest = -1;
      let largestIdx = -1;
      for (const m of group.members) {
        const photo = byNorm.get(normalizePath(m.path));
        if (!photo) continue; // not indexed yet
        members.push({
          photoId: photo.id,
          status: "ignored",
          similarity: m.similarity ?? null,
        });
        if (photo.size > largest) {
          largest = photo.size;
          largestIdx = members.length - 1;
        }
      }
      if (members.length >= 2) {
        // Suggest keeping the largest file.
        if (largestIdx >= 0) members[largestIdx].status = "kept";
        groups.push(members);
      }
    }
    return groups;
  } finally {
    if (fs.existsSync(outFile)) await fsp.rm(outFile).catch(() => {});
  }
}

/**
 * Run czkawka and store the results. Tracked as a `dedup` job. The exact
 * (hash-based) pass always runs; the similar-image (perceptual) pass only runs
 * when `config.dedupSimilarEnabled` is set.
 */
export async function runDedup(): Promise<{ exact: number; similar: number }> {
  const job = jobs.create("dedup", "Scanning for duplicates…");
  try {
    const steps = config.dedupSimilarEnabled ? 2 : 1;
    jobs.update(job.id, {
      total: steps,
      progress: 0,
      message: "Exact duplicates…",
    });
    const exactGroups = await scanKind("exact");
    const exact = replaceGroups("exact", exactGroups);

    let similar = 0;
    if (config.dedupSimilarEnabled) {
      jobs.update(job.id, { progress: 1, message: "Similar images…" });
      const similarGroups = await scanKind("similar");
      similar = replaceGroups("similar", similarGroups);
    } else {
      // Clear any stale similar groups from a previous run.
      replaceGroups("similar", []);
    }

    jobs.update(job.id, {
      progress: steps,
      message: config.dedupSimilarEnabled
        ? `Found ${exact} exact and ${similar} similar groups`
        : `Found ${exact} exact duplicate group${exact === 1 ? "" : "s"}`,
    });
    jobs.finish(job.id, "dedup");
    return { exact, similar };
  } catch (err) {
    jobs.finish(
      job.id,
      "dedup",
      err instanceof Error ? err.message : String(err)
    );
    throw err;
  }
}
