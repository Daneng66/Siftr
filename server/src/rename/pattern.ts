/**
 * Bulk-rename pattern engine (pure functions — unit tested). Supported tokens:
 *   {original}      original filename (without extension)
 *   {name}          current filename (without extension)
 *   {date}          date taken, default format YYYYMMDD
 *   {date:FORMAT}   date taken with custom format (YYYY MM DD HH mm ss)
 *   {seq}           sequence number (1-based)
 *   {seq:N}         sequence number zero-padded to N digits
 *   {camera}        camera model
 *   {custom}        user-provided custom text
 * The original file extension is preserved automatically.
 */
export interface RenameContext {
  originalName: string; // without extension
  currentName: string; // without extension
  dateTaken: string | null; // ISO string
  cameraModel: string | null;
  index: number; // 0-based position within the selection
  customText: string;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function formatDate(iso: string | null, format: string): string {
  if (!iso) return "unknown-date";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "unknown-date";
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1, 2),
    DD: pad(d.getDate(), 2),
    HH: pad(d.getHours(), 2),
    mm: pad(d.getMinutes(), 2),
    ss: pad(d.getSeconds(), 2),
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (m) => map[m] ?? m);
}

/** Strip characters that are illegal in filenames on common filesystems. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "") // no leading dots
    .slice(0, 200);
}

/** Apply a rename pattern, returning the new base name (without extension). */
export function applyPattern(pattern: string, ctx: RenameContext): string {
  const result = pattern.replace(
    /\{(original|name|date|seq|camera|custom)(?::([^}]*))?\}/g,
    (_match, token: string, arg?: string) => {
      switch (token) {
        case "original":
          return ctx.originalName;
        case "name":
          return ctx.currentName;
        case "date":
          return formatDate(ctx.dateTaken, arg || "YYYYMMDD");
        case "seq": {
          const width = arg ? parseInt(arg, 10) || 0 : 0;
          const value = ctx.index + 1;
          return width > 0 ? pad(value, width) : String(value);
        }
        case "camera":
          return ctx.cameraModel ?? "unknown-camera";
        case "custom":
          return ctx.customText;
        default:
          return _match;
      }
    }
  );
  return sanitizeFilename(result);
}
