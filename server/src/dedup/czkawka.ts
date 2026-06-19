import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { config } from "../config";
import { parseCzkawkaGroups } from "./parser";
import { getPhotoByPath } from "../db/photos";
import {
  DupKind,
  GroupMemberInput,
  replaceGroups,
} from "../db/duplicates";
import { jobs } from "../jobs";

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
 * Build czkawka args for a kind. NOTE: czkawka_cli flags vary across versions —
 * verify with `czkawka_cli <sub> --help` for the pinned image build. These use
 * the widely-supported `-d`/`-f` short flags.
 */
function buildArgs(kind: DupKind, outFile: string): string[] {
  if (kind === "exact") {
    return ["dup", "-d", config.photosDir, "-m", "1024", "-f", outFile];
  }
  return ["image", "-d", config.photosDir, "-f", outFile];
}

async function scanKind(kind: DupKind): Promise<GroupMemberInput[][]> {
  const outFile = path.join(
    os.tmpdir(),
    `siftr-czkawka-${kind}-${Date.now()}.txt`
  );
  try {
    await run(config.czkawkaBin, buildArgs(kind, outFile));
    let text = "";
    try {
      text = await fsp.readFile(outFile, "utf8");
    } catch {
      text = ""; // no results file => no duplicates found
    }
    const parsed = parseCzkawkaGroups(text);

    const groups: GroupMemberInput[][] = [];
    for (const group of parsed) {
      const members: GroupMemberInput[] = [];
      let largest = -1;
      let largestIdx = -1;
      for (const m of group.members) {
        const photo = getPhotoByPath(m.path);
        if (!photo) continue; // not indexed yet
        members.push({
          photoId: photo.id,
          status: "ignored",
          similarity: m.similarity ?? null,
        });
        if (photo.file_size > largest) {
          largest = photo.file_size;
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

/** Run both czkawka passes and store the results. Tracked as a `dedup` job. */
export async function runDedup(): Promise<{ exact: number; similar: number }> {
  const job = jobs.create("dedup", "Scanning for duplicates…");
  try {
    jobs.update(job.id, { total: 2, progress: 0, message: "Exact duplicates…" });
    const exactGroups = await scanKind("exact");
    const exact = replaceGroups("exact", exactGroups);

    jobs.update(job.id, { progress: 1, message: "Similar images…" });
    const similarGroups = await scanKind("similar");
    const similar = replaceGroups("similar", similarGroups);

    jobs.update(job.id, {
      progress: 2,
      message: `Found ${exact} exact and ${similar} similar groups`,
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
