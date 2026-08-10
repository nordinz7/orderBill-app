/**
 * Characters a file or folder name cannot carry: the ones Android and the
 * Storage Access Framework reserve, plus control characters. `~` is in here for
 * this app's own reason — the exporter uses it to separate the parts of a
 * generated name, so it must never turn up inside one of those parts.
 */
const UNSAFE = /[\\/:*?"<>|~\x00-\x1F\x7F]/g;

/**
 * Longest label kept, in characters. A name is one part of a longer generated
 * filename, and filesystems cap the whole thing at 255 bytes — which a Tamil
 * name reaches in ~85 characters, since each one costs three.
 */
const MAX_LENGTH = 60;

/**
 * Make `name` safe to use as one segment of a path.
 *
 * Only genuinely unusable characters are removed. Tamil — or any other script —
 * survives intact, so a customer's own name is what appears on their file
 * rather than a row of underscores.
 */
export function sanitizeSegment(name: string, maxLength: number = MAX_LENGTH): string {
  const cleaned = name
    .replace(UNSAFE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // A leading dot hides the file on Android; a trailing one is dropped by
    // some filesystems, which would quietly change the name.
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim();
  return cleaned.slice(0, maxLength).trim() || 'Untitled';
}
