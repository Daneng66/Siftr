import { applyPattern, type RenameContext } from "../rename/pattern";

/** A resolved target location for one photo, split into path segments and a base filename. */
export interface ResolvedPath {
  /** Folder segments (no slashes, no leading/trailing empties), root-relative. */
  dirSegments: string[];
  /** Base filename, without extension. */
  base: string;
}

/**
 * Resolve a folder/filename pattern (e.g. `{date:YYYY}/{date:MM}/{original}`)
 * against a photo's context. `/` splits the pattern into path segments; each
 * segment is resolved independently through the same token engine used for
 * flat rename patterns, then sanitized on its own so a token that expands to
 * something containing illegal characters can't smuggle in extra path parts.
 * Segments that resolve to nothing (e.g. a stray `//` or a token with no
 * value) are dropped rather than producing empty directory names.
 */
export function applyPathPattern(pattern: string, ctx: RenameContext): ResolvedPath {
  const segments = pattern
    .split("/")
    .map((segment) => applyPattern(segment, ctx))
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) return { dirSegments: [], base: "" };
  return { dirSegments: segments.slice(0, -1), base: segments[segments.length - 1] };
}

/** Join folder segments into a `/`-separated relative directory path (possibly ""). */
export function joinRelDir(...parts: string[]): string {
  return parts
    .flatMap((p) => p.split("/"))
    .filter((p) => p.length > 0)
    .join("/");
}
