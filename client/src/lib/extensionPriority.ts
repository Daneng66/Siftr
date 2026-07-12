/**
 * User-defined extension priority order (e.g. "heic, raw, jpg") for picking
 * which copy in a duplicate group should be recommended to keep, overriding
 * the default largest-file-size pick. Earlier extensions in the list rank higher.
 */
export function parseExtensionPriority(input: string): string[] {
  return input
    .split(/[,\s]+/)
    .map((s) => s.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/**
 * Returns the id of the member whose extension ranks best (lowest index) in
 * the priority list, or null if the list is empty or no member's extension
 * appears in it.
 */
export function pickPreferredByExtension<T extends { id: number; filename: string }>(
  members: T[],
  priority: string[]
): number | null {
  if (priority.length === 0) return null;
  let bestId: number | null = null;
  let bestRank = Infinity;
  for (const m of members) {
    const rank = priority.indexOf(extOf(m.filename));
    if (rank !== -1 && rank < bestRank) {
      bestRank = rank;
      bestId = m.id;
    }
  }
  return bestId;
}
