/**
 * Parsers for czkawka_cli **compact JSON** output (`-C` flag), unit-tested.
 *
 * We use JSON rather than the formatted text file because the text format quotes
 * paths and varies across versions, whereas the JSON shape is stable:
 *
 *   duplicates (`dup -C`):  { "<size>": [ [ {path,size,hash,...}, ... ], ... ] }
 *   images     (`image -C`): [ [ {path,similarity,...}, ... ], ... ]
 */
export interface ParsedMember {
  path: string;
  hash?: string;
  similarity?: string;
}

export interface ParsedGroup {
  members: ParsedMember[];
}

interface CzkawkaFile {
  path?: string;
  hash?: unknown;
  similarity?: unknown;
}

function toMembers(group: unknown): ParsedMember[] {
  if (!Array.isArray(group)) return [];
  const members: ParsedMember[] = [];
  for (const file of group as CzkawkaFile[]) {
    if (file && typeof file.path === "string") {
      members.push({
        path: file.path,
        hash: typeof file.hash === "string" ? file.hash : undefined,
        similarity:
          file.similarity != null ? String(file.similarity) : undefined,
      });
    }
  }
  return members;
}

/** Parse `dup -C` output: an object keyed by file size, each an array of groups. */
export function parseDuplicatesJson(text: string): ParsedGroup[] {
  if (!text.trim()) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const groups: ParsedGroup[] = [];
  // Object keyed by size -> array of groups. (Tolerate a bare array too.)
  const buckets = Array.isArray(data)
    ? (data as unknown[])
    : Object.values(data as Record<string, unknown>);
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const group of bucket) {
      const members = toMembers(group);
      if (members.length >= 2) groups.push({ members });
    }
  }
  return groups;
}

/** Parse `image -C` output: a flat array of groups. */
export function parseImagesJson(text: string): ParsedGroup[] {
  if (!text.trim()) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const groups: ParsedGroup[] = [];
  for (const group of data) {
    const members = toMembers(group);
    if (members.length >= 2) groups.push({ members });
  }
  return groups;
}
