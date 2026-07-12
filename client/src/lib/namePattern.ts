/**
 * User-defined filename patterns for spotting "numbered copy" duplicates that
 * share a base name, e.g. `{name}_{d}.{ext}` matches both `sunset.jpg` and
 * `sunset_1.jpg` as the same `sunset`/`jpg` identity.
 *
 * Tokens: `{name}` — base name (captured), `{d}` — a run of digits, `{ext}` —
 * file extension (captured), `*` — any run of characters (glob-style
 * wildcard), `?` — any single character. Everything between `{name}` and the
 * final `.` before `{ext}` (typically the `{d}`/wildcard suffix and its
 * surrounding delimiters, e.g. `_` or ` (...)`) is treated as optional, so the
 * "un-suffixed" original filename matches the pattern too.
 *
 * `*`/`?` work best anchored to a literal delimiter (e.g. `{name}_*.{ext}`).
 * A bare `{name}*.{ext}` with no delimiter is ambiguous — like an unanchored
 * shell glob, there's no single correct split between "name" and "suffix" —
 * so `{name}` falls back to its default lazy (shortest-match) behavior.
 */
export interface NamePatternMatch {
  name: string;
  ext: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Turn a literal pattern fragment (which may still contain "{d}", "*", "?") into regex source. */
function fragmentToRegex(s: string): string {
  return s
    .split(/(\{d\}|\*|\?)/)
    .map((part) => {
      if (part === "{d}") return "\\d+";
      if (part === "*") return ".*";
      if (part === "?") return ".";
      return escapeRegex(part);
    })
    .join("");
}

/** Compile a user pattern into a matcher, or null if the pattern is invalid. */
export function compileNamePattern(
  pattern: string
): ((filename: string) => NamePatternMatch | null) | null {
  const NAME = "{name}";
  const EXT = "{ext}";
  const nameIdx = pattern.indexOf(NAME);
  const extIdx = pattern.indexOf(EXT);
  if (nameIdx === -1 || extIdx === -1 || extIdx < nameIdx) return null;

  const before = pattern.slice(0, nameIdx);
  const middle = pattern.slice(nameIdx + NAME.length, extIdx);
  const after = pattern.slice(extIdx + EXT.length);

  // Split the middle at its last literal "." (the extension separator every
  // filename has); everything before that stays optional, the "." onward
  // (usually just ".") is required so the base filename still matches.
  const lastDot = middle.lastIndexOf(".");
  const optionalMid = lastDot === -1 ? middle : middle.slice(0, lastDot);
  const requiredMid = lastDot === -1 ? "" : middle.slice(lastDot);

  const body =
    fragmentToRegex(before) +
    "(?<name>.+?)" +
    (optionalMid ? `(?:${fragmentToRegex(optionalMid)})?` : "") +
    fragmentToRegex(requiredMid) +
    "(?<ext>[^./\\\\]+)" +
    fragmentToRegex(after);

  let re: RegExp;
  try {
    re = new RegExp(`^${body}$`, "i");
  } catch {
    return null;
  }

  return (filename: string) => {
    const m = re.exec(filename);
    if (!m || !m.groups) return null;
    return { name: m.groups.name ?? "", ext: (m.groups.ext ?? "").toLowerCase() };
  };
}

/**
 * Given a group's members, returns the ids of members whose filenames share a
 * {name}/{ext} identity under the pattern (only ids that have >= 1 sibling
 * match are included — a lone match with nothing to pair against is dropped).
 */
export function findPatternMatches<T extends { id: number; filename: string }>(
  members: T[],
  pattern: string
): Set<number> {
  const matcher = compileNamePattern(pattern);
  const result = new Set<number>();
  if (!matcher) return result;

  const byKey = new Map<string, number[]>();
  for (const m of members) {
    const match = matcher(m.filename);
    if (!match) continue;
    const key = `${match.name} ${match.ext}`;
    const ids = byKey.get(key);
    if (ids) ids.push(m.id);
    else byKey.set(key, [m.id]);
  }
  for (const ids of byKey.values()) {
    if (ids.length >= 2) for (const id of ids) result.add(id);
  }
  return result;
}
