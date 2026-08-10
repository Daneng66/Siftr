import { execFile } from "node:child_process";
import { config } from "../config";

export interface VideoMetadata {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout ?? "");
    });
  });
}

/**
 * Read dimensions + duration via ffprobe. Rotation metadata (common on phone
 * video) is applied so width/height reflect the video as it actually plays.
 * Returns all-null fields (rather than throwing) when ffprobe is missing or
 * the file is unreadable — callers still index the file with basic info.
 */
export async function readVideoMetadata(filePath: string): Promise<VideoMetadata> {
  const result: VideoMetadata = { width: null, height: null, durationSeconds: null };
  try {
    const stdout = await run(config.ffprobeBin, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,duration:format=duration",
      "-show_entries",
      "stream_tags=rotate",
      "-show_entries",
      "side_data=rotation",
      "-of",
      "json",
      filePath,
    ]);
    const data = JSON.parse(stdout) as {
      streams?: Array<{
        width?: number;
        height?: number;
        duration?: string;
        tags?: { rotate?: string };
        side_data_list?: Array<{ rotation?: number }>;
      }>;
      format?: { duration?: string };
    };
    const stream = data.streams?.[0];
    if (stream) {
      let width = typeof stream.width === "number" ? stream.width : null;
      let height = typeof stream.height === "number" ? stream.height : null;
      const rotateTag = stream.tags?.rotate ? Number(stream.tags.rotate) : 0;
      const rotationSide = stream.side_data_list?.find(
        (s) => typeof s.rotation === "number"
      )?.rotation;
      const rotation = Math.abs(rotationSide ?? rotateTag) % 180;
      if (rotation === 90 && width && height) [width, height] = [height, width];
      result.width = width;
      result.height = height;
    }
    const duration = stream?.duration ?? data.format?.duration;
    if (duration) {
      const n = Number(duration);
      if (!isNaN(n) && n > 0) result.durationSeconds = n;
    }
  } catch {
    /* ffprobe missing or file unreadable — leave nulls */
  }
  return result;
}
