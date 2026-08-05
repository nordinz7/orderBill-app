import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const EXPORT_DIR_KEY = '@orderbill_export_dir';

/**
 * Writing into a folder the user picked relies on the Android Storage Access
 * Framework, which has no iOS equivalent.
 */
export const isFolderExportSupported = Platform.OS === 'android';

// ─── Folder selection ─────────────────────────────────────────────────────────

/** The previously granted export folder, or null if none has been picked yet. */
export async function getSavedExportDirectory(): Promise<string | null> {
  return AsyncStorage.getItem(EXPORT_DIR_KEY);
}

/**
 * Ask the user to pick (and grant persistent access to) an export folder.
 * Returns the granted SAF tree URI, or null if they cancelled.
 */
export async function pickExportDirectory(): Promise<string | null> {
  const existing = await getSavedExportDirectory();
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync(existing);
  if (!permissions.granted) return null;
  await AsyncStorage.setItem(EXPORT_DIR_KEY, permissions.directoryUri);
  return permissions.directoryUri;
}

export async function forgetExportDirectory(): Promise<void> {
  await AsyncStorage.removeItem(EXPORT_DIR_KEY);
}

/**
 * Turn a SAF tree URI into something a person can find on their phone.
 * `content://…/tree/primary%3ADocuments%2ForderBill` becomes `Documents/orderBill`.
 */
export function describeExportDirectory(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const afterVolume = decoded.slice(decoded.lastIndexOf(':') + 1);
    return afterVolume || decoded;
  } catch {
    return uri;
  }
}

// ─── Writing files ────────────────────────────────────────────────────────────

/** Strip characters that are not safe in a file or folder name. */
export function sanitizeSegment(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9\-_. ]/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned || 'Untitled';
}

/**
 * A folder open for writing, with its existing children indexed by name.
 *
 * Re-exporting has to find the previous version of a document, so the folder
 * is listed once when it is opened rather than once per file written.
 */
export interface ExportFolder {
  uri: string;
  children: Map<string, string>;
}

async function indexChildren(dirUri: string): Promise<Map<string, string>> {
  const children = new Map<string, string>();
  for (const childUri of await StorageAccessFramework.readDirectoryAsync(dirUri)) {
    const decoded = decodeURIComponent(childUri);
    const name = decoded.slice(decoded.lastIndexOf('/') + 1);
    if (name) children.set(name, childUri);
  }
  return children;
}

/**
 * Open `name` inside `parentUri`, creating it if absent. Pass a null name to
 * open the parent folder itself.
 */
export async function openExportFolder(parentUri: string, name: string | null): Promise<ExportFolder> {
  if (!name) {
    return { uri: parentUri, children: await indexChildren(parentUri) };
  }
  const siblings = await indexChildren(parentUri);
  const existing = siblings.get(name);
  const uri = existing ?? (await StorageAccessFramework.makeDirectoryAsync(parentUri, name));
  return { uri, children: existing ? await indexChildren(uri) : new Map() };
}

/**
 * Write a base64 PNG as `fileName.png` inside `folder`.
 *
 * SAF has no "overwrite" mode — handed a name that is already taken,
 * createFileAsync silently produces `Bill (1).png` next to `Bill.png`. Callers
 * are expected to use `hasExportFile` and skip instead, so the delete here only
 * guards against that quirk; it is not the normal path.
 */
export async function writePngToFolder(
  folder: ExportFolder,
  fileName: string,
  base64: string,
): Promise<void> {
  const clash = folder.children.get(`${fileName}.png`);
  if (clash) {
    await StorageAccessFramework.deleteAsync(clash, { idempotent: true });
    folder.children.delete(`${fileName}.png`);
  }
  // createFileAsync takes the name *without* an extension and derives it from
  // the MIME type.
  const fileUri = await StorageAccessFramework.createFileAsync(folder.uri, fileName, 'image/png');
  await StorageAccessFramework.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
  folder.children.set(`${fileName}.png`, fileUri);
}

// ─── Idempotent naming ────────────────────────────────────────────────────────

/**
 * Exported files are named `<kind>~<stamp>~<id>~<label>~<fingerprint>.png`.
 *
 * The leading `<kind>~<stamp>~<id>~` is the *key*: the record's stable identity,
 * and what a re-export replaces. The label is cosmetic — it is only there so a
 * person can tell the files apart — and the fingerprint covers everything that
 * affects the rendered image.
 *
 * That makes a repeat export a no-op instead of a conflict: an unchanged
 * document already exists under exactly that name and is skipped, and a changed
 * one is written under a new name before the older versions of the same key are
 * removed, so the document is never briefly missing.
 *
 * `~` is deliberately outside `sanitizeSegment`'s allowlist, so it can never
 * appear inside a label and the parts stay unambiguous.
 */
export function exportKey(kind: string, stamp: string, id: number): string {
  return `${kind}~${stamp}~${String(id).padStart(4, '0')}~`;
}

/** Full name (without extension) for one version of the document at `key`. */
export function exportFileName(key: string, label: string, fingerprint: string): string {
  return `${key}${sanitizeSegment(label)}~${fingerprint}`;
}

/**
 * 32-bit FNV-1a, as 8 hex characters. Used to notice that a document's inputs
 * changed — not for anything that needs to resist tampering.
 */
export function fingerprint(parts: (string | number)[]): string {
  // Joined on the unit separator, a character no typed-in field will
  // contain, so adjacent values cannot shift across the boundary and
  // still hash the same.
  const input = parts.join(String.fromCharCode(31));
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** True when this exact version is already on disk, so there is nothing to do. */
export function hasExportFile(folder: ExportFolder, fileName: string): boolean {
  return folder.children.has(`${fileName}.png`);
}

/**
 * Delete every file under `key` apart from `keep` — the older versions after a
 * write, or all of them when the record has nothing to export any more.
 */
export async function pruneExportKey(
  folder: ExportFolder,
  key: string,
  keep: string | null,
): Promise<void> {
  const keepName = keep && `${keep}.png`;
  for (const [name, uri] of Array.from(folder.children)) {
    if (!name.startsWith(key) || name === keepName) continue;
    await StorageAccessFramework.deleteAsync(uri, { idempotent: true });
    folder.children.delete(name);
  }
}
