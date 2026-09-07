import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { config } from "../config";
import { parseDuplicatesJson, parseImagesJson, parseVideosJson } from "./parser";
import { bulkUpdateFileHashes, getIndexedPaths } from "../db/photos";
import {
  GroupMemberInput,
  replaceGroups,
} from "../db/duplicates";
import { jobs } from "../jobs";

/** Which czkawka pass to run — distinct from the DB's `exact`/`similar` kind:
 * similar images and similar videos both land in the DB's "similar" bucket. */
type ScanPass = "exact" | "similarImage" | "similarVideo";

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
      {
        maxBuffer: 64 * 1024 * 1024,
        // Persist czkawka's cache on the data volume so unchanged files aren't
        // re-hashed on every run (it defaults to a non-persisted ~/.cache dir).
        env: { ...process.env, CZKAWKA_CACHE_PATH: config.czkawkaCachePath },
      },
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
 * Build czkawka args for a pass, writing compact JSON (`-C`). Verified against
 * czkawka_cli 9.0.0; `-d` directories, `-m` min size, `-s`/`-t` similarity knobs.
 */
function buildArgs(pass: ScanPass, outFile: string): string[] {
  if (pass === "exact") {
    // `-u` keeps a prehash cache too, so partial hashes also survive between runs.
    return ["dup", "-d", config.photosDir, "-m", "1024", "-u", "-C", outFile];
  }
  if (pass === "similarVideo") {
    // Requires ffmpeg on PATH — czkawka's own runtime dependency for this pass.
    return [
      "video",
      "-d",
      config.photosDir,
      "-t",
      config.czkawkaVideoTolerance,
      "-C",
      outFile,
    ];
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

function parseOutput(pass: ScanPass, text: string) {
  if (pass === "exact") return parseDuplicatesJson(text);
  if (pass === "similarVideo") return parseVideosJson(text);
  return parseImagesJson(text);
}

interface ScanPassResult {
  groups: GroupMemberInput[][];
  /** path → hash pairs from czkawka output (only populated for the exact pass). */
  pathHashes: Array<{ path: string; hash: string }>;
}

async function scanPass(pass: ScanPass): Promise<ScanPassResult> {
  const outFile = path.join(
    os.tmpdir(),
    `siftr-czkawka-${pass}-${Date.now()}.json`
  );
  try {
    await run(config.czkawkaBin, buildArgs(pass, outFile));
    let text = "";
    try {
      text = await fsp.readFile(outFile, "utf8");
    } catch {
      text = ""; // no results file => no duplicates found
    }
    const parsed = parseOutput(pass, text);

    // Map indexed photos by a normalized path so czkawka's output matches
    // regardless of slash direction / case. czkawka lowercases Windows paths,
    // while the scanner stores them proper-case — exact matching would miss them.
    const byNorm = new Map<string, { id: number; size: number; path: string }>();
    for (const [p, v] of getIndexedPaths()) {
      byNorm.set(normalizePath(p), { id: v.id, size: v.size_seen, path: p });
    }

    const groups: GroupMemberInput[][] = [];
    const pathHashes: Array<{ path: string; hash: string }> = [];

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
        // Collect hashes from exact dup output to populate file_hash in DB.
        if (pass === "exact" && m.hash) {
          pathHashes.push({ path: photo.path, hash: m.hash });
        }
      }
      if (members.length >= 2) {
        // Suggest keeping the largest file.
        if (largestIdx >= 0) members[largestIdx].status = "recommended";
        groups.push(members);
      }
    }
    return { groups, pathHashes };
  } finally {
    if (fs.existsSync(outFile)) await fsp.rm(outFile).catch(() => {});
  }
}

/**
 * Run czkawka and store the results. Tracked as a `dedup` job. The exact
 * (hash-based) pass always runs — it isn't extension-filtered, so it already
 * covers both photos and videos once both are indexed. The similar-image and
 * similar-video (perceptual) passes are each independently opt-in, and their
 * results are merged into the same "similar" group bucket.
 */
export async function runDedup(): Promise<{ exact: number; similar: number }> {
  const job = jobs.create("dedup", "Scanning for duplicates…");
  try {
    const passes: ScanPass[] = ["exact"];
    if (config.dedupSimilarEnabled) passes.push("similarImage");
    if (config.dedupSimilarVideoEnabled) passes.push("similarVideo");
    const steps = passes.length;
    jobs.update(job.id, {
      total: steps,
      progress: 0,
      message: "Exact duplicates…",
    });

    const { groups: exactGroups, pathHashes } = await scanPass("exact");
    const exact = replaceGroups("exact", exactGroups);
    // Persist the hashes czkawka computed so scan no longer needs sha256File.
    bulkUpdateFileHashes(pathHashes);

    const similarGroups: GroupMemberInput[][] = [];
    let step = 1;
    if (config.dedupSimilarEnabled) {
      jobs.update(job.id, { progress: step++, message: "Similar images…" });
      const { groups } = await scanPass("similarImage");
      similarGroups.push(...groups);
    }
    if (config.dedupSimilarVideoEnabled) {
      jobs.update(job.id, { progress: step++, message: "Similar videos…" });
      const { groups } = await scanPass("similarVideo");
      similarGroups.push(...groups);
    }
    // Replace unconditionally: clears stale groups from a previous run even
    // when neither similar pass is enabled this time.
    const similar = replaceGroups("similar", similarGroups);

    jobs.update(job.id, {
      progress: steps,
      message:
        config.dedupSimilarEnabled || config.dedupSimilarVideoEnabled
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
