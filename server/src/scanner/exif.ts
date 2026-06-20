import exifr from "exifr";

export interface ExifInfo {
  dateTaken: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
}

function toIso(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/** Read the subset of EXIF we index. Single parse covers both tags and GPS. */
export async function readExif(filePath: string): Promise<ExifInfo> {
  const info: ExifInfo = {
    dateTaken: null,
    cameraMake: null,
    cameraModel: null,
    gpsLat: null,
    gpsLon: null,
  };

  try {
    // gps: true makes exifr emit decimal `latitude`/`longitude` alongside tags.
    const tags = await exifr.parse(filePath, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate", "Make", "Model"],
      gps: true,
    });
    if (tags) {
      info.dateTaken =
        toIso(tags.DateTimeOriginal) ??
        toIso(tags.CreateDate) ??
        toIso(tags.ModifyDate);
      info.cameraMake = tags.Make ? String(tags.Make).trim() : null;
      info.cameraModel = tags.Model ? String(tags.Model).trim() : null;
      if (typeof tags.latitude === "number") {
        info.gpsLat = tags.latitude;
        info.gpsLon = typeof tags.longitude === "number" ? tags.longitude : null;
      }
    }
  } catch {
    /* no/unsupported EXIF — leave nulls */
  }

  return info;
}
