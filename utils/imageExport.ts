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
 * SAF has no "overwrite" mode — createFileAsync would silently produce
 * `Bill (1).png` next to `Bill.png` — so re-exports look up the existing
 * document by name and delete it first. Listing once per folder keeps that
 * from turning into a directory read per file.
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
 * Write a base64 PNG as `fileName.png` inside `folder`, replacing any file
 * already using that name.
 */
export async function writePngToFolder(
  folder: ExportFolder,
  fileName: string,
  base64: string,
): Promise<void> {
  const stale = folder.children.get(`${fileName}.png`);
  if (stale) {
    await StorageAccessFramework.deleteAsync(stale, { idempotent: true });
    folder.children.delete(`${fileName}.png`);
  }
  // createFileAsync takes the name *without* an extension and derives it from
  // the MIME type.
  const fileUri = await StorageAccessFramework.createFileAsync(folder.uri, fileName, 'image/png');
  await StorageAccessFramework.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
  folder.children.set(`${fileName}.png`, fileUri);
}
