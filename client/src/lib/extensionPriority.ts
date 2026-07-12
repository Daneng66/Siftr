/**
 * User-defined extension priority order (e.g. "heic, raw, jpg") for picking
 * which copy in a duplicate group should be recommended to keep, overriding
 * the default largest-file-size pick. Earlier extensions in the list rank
 * higher — but only among copies tied for the group's highest resolution, so
 * extension preference can never promote a lower-resolution copy.
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

function resolutionOf(m: { width: number | null; height: number | null }): number {
  return (m.width ?? 0) * (m.height ?? 0);
}

/**
 * Returns the id of the member whose extension ranks best (lowest index) in
 * the priority list, or null if the list is empty or no member's extension
 * appears in it. Extension is only used as a tiebreaker among the
 * highest-resolution copies in the group — it never overrides a resolution
 * difference (e.g. a lower-res PNG can't beat a higher-res JPEG just because
 * PNG is listed first).
 */
export function pickPreferredByExtension<
  T extends { id: number; filename: string; width: number | null; height: number | null },
>(members: T[], priority: string[]): number | null {
  if (priority.length === 0) return null;

  const maxResolution = Math.max(...members.map(resolutionOf));
  const topResolutionMembers = members.filter((m) => resolutionOf(m) === maxResolution);

  let bestId: number | null = null;
  let bestRank = Infinity;
  for (const m of topResolutionMembers) {
    const rank = priority.indexOf(extOf(m.filename));
    if (rank !== -1 && rank < bestRank) {
      bestRank = rank;
      bestId = m.id;
    }
  }
  return bestId;
}
