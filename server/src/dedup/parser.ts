/**
 * Parser for czkawka_cli text result files (pure — unit tested).
 *
 * czkawka writes groups separated by blank lines. We tolerate both the duplicate
 * format (one bare path per line) and the similar-images format
 * (`PATH - WxH - SIZE - SIMILARITY`). Header/summary lines are skipped. Any line
 * whose first " - "-delimited segment looks like an absolute path is treated as a
 * group member; blank lines (or header lines) break groups.
 */
export interface ParsedMember {
  path: string;
  similarity?: string;
}

export interface ParsedGroup {
  members: ParsedMember[];
}

const HEADER_RE = /^(-{3,}|Found |Searching|Results|Total|Number|Mode|Stopped)/i;

function looksLikePath(s: string): boolean {
  // Absolute Unix path, or Windows drive path (parser is cross-platform safe).
  return /^\//.test(s) || /^[A-Za-z]:[\\/]/.test(s);
}

export function parseCzkawkaGroups(text: string): ParsedGroup[] {
  const lines = text.split(/\r?\n/);
  const groups: ParsedGroup[] = [];
  let current: ParsedMember[] = [];

  const flush = () => {
    if (current.length >= 2) groups.push({ members: current });
    current = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (HEADER_RE.test(line.trim())) {
      // A header generally introduces a new group/section.
      flush();
      continue;
    }
    // Split on " - " — duplicates have no such separator (whole line is the path),
    // similar images put metadata after it.
    const segments = line.split(" - ");
    const path = segments[0].trim();
    if (!looksLikePath(path)) {
      // Unexpected non-path content ends the current group.
      flush();
      continue;
    }
    const similarity =
      segments.length >= 4 ? segments[segments.length - 1].trim() : undefined;
    current.push({ path, similarity });
  }
  flush();
  return groups;
}
