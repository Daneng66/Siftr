import { execFile } from "node:child_process";
import { config } from "../config";

export interface ExifEdits {
  dateTaken?: string | null; // ISO string
  gpsLat?: number | null;
  gpsLon?: number | null;
  cameraMake?: string | null;
  cameraModel?: string | null;
}

function execFileAsync(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return reject(
            new Error(
              `exiftool not found (looked for "${bin}"). Set EXIFTOOL_BIN or install it.`
            )
          );
        }
        return reject(new Error(stderr || err.message));
      }
      resolve(stdout);
    });
  });
}

/** Format an ISO date as the EXIF "YYYY:MM:DD HH:MM:SS" string. */
function exifDate(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** Build the exiftool argument list for a set of edits (no file path included). */
export function buildExifArgs(edits: ExifEdits): string[] {
  const args: string[] = [];
  if (edits.dateTaken !== undefined && edits.dateTaken !== null) {
    const d = exifDate(edits.dateTaken);
    if (d) {
      args.push(`-DateTimeOriginal=${d}`);
      args.push(`-CreateDate=${d}`);
      args.push(`-ModifyDate=${d}`);
    }
  }
  if (edits.gpsLat !== undefined && edits.gpsLat !== null) {
    args.push(`-GPSLatitude=${Math.abs(edits.gpsLat)}`);
    args.push(`-GPSLatitudeRef=${edits.gpsLat >= 0 ? "N" : "S"}`);
  }
  if (edits.gpsLon !== undefined && edits.gpsLon !== null) {
    args.push(`-GPSLongitude=${Math.abs(edits.gpsLon)}`);
    args.push(`-GPSLongitudeRef=${edits.gpsLon >= 0 ? "E" : "W"}`);
  }
  if (edits.cameraMake !== undefined && edits.cameraMake !== null) {
    args.push(`-Make=${edits.cameraMake}`);
  }
  if (edits.cameraModel !== undefined && edits.cameraModel !== null) {
    args.push(`-Model=${edits.cameraModel}`);
  }
  return args;
}

/** Write EXIF edits into one or more files in place (no _original backups). */
export async function writeExif(
  filePaths: string[],
  edits: ExifEdits
): Promise<void> {
  const tagArgs = buildExifArgs(edits);
  if (tagArgs.length === 0 || filePaths.length === 0) return;
  await execFileAsync(config.exiftoolBin, [
    "-overwrite_original",
    "-ignoreMinorErrors",
    ...tagArgs,
    ...filePaths,
  ]);
}
