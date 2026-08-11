import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { sanitizeSegment } from './filenames';

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

/**
 * Show a just-written folder in whatever app handles files on this phone.
 *
 * The images are the point of the export, and until now the only thing pointing
 * at them was a path in an alert the user had to go and find by hand. The URI
 * SAF hands back is already a document URI the picker granted read access to,
 * so ACTION_VIEW on it with the directory MIME type lands straight inside.
 *
 * Returns false rather than throwing when nothing on the device will take the
 * intent — an export that saved every file has not failed just because the
 * phone has no file manager.
 */
export async function openFolderInFileManager(folderUri: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: folderUri,
      type: 'vnd.android.document/directory',
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Writing files ────────────────────────────────────────────────────────────

export { sanitizeSegment } from './filenames';

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
  const parent: ExportFolder = { uri: parentUri, children: await indexChildren(parentUri) };
  return name ? openChildFolder(parent, name) : parent;
}

/**
 * Open `name` inside an already-open folder, creating it if absent.
 *
 * Takes the parent as an `ExportFolder` rather than a URI so that opening many
 * children — one folder per customer, say — lists the parent once in total
 * instead of once per child.
 */
export async function openChildFolder(parent: ExportFolder, name: string): Promise<ExportFolder> {
  const found = await findChildFolder(parent, name);
  if (found) return found;
  const uri = await StorageAccessFramework.makeDirectoryAsync(parent.uri, name);
  parent.children.set(name, uri);
  return { uri, children: new Map() };
}

/** Open `name` inside `parent` only if it is already there — never creates it. */
export async function findChildFolder(parent: ExportFolder, name: string): Promise<ExportFolder | null> {
  const uri = parent.children.get(name);
  return uri ? { uri, children: await indexChildren(uri) } : null;
}

/**
 * Write a base64 PNG as `fileName.png` inside `folder`.
 *
 * SAF has no "overwrite" mode — handed a name that is already taken,
 * createFileAsync silently produces `Bill (1).png` next to `Bill.png`. Deleting
 * first is what makes re-exporting a day replace what is there instead of
 * piling copies up beside it.
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

// ─── Naming ───────────────────────────────────────────────────────────────────

/**
 * What an exported document is called: `2026-08-10 - Ah Seng.png`.
 *
 * The name is the whole of it — no key, no hash. A file is going to be found in
 * a folder on a phone and sent on from there, so it has to say what it is to
 * someone who never saw the app, and the two parts it needs are the day it
 * covers and who it belongs to. The date leads so that a customer's folder
 * falls into chronological order.
 *
 * Re-exporting the same day overwrites, rather than recognising the file as
 * unchanged and skipping it — the cost of a name with nothing hidden in it.
 */
export function exportFileName(stamp: string, label: string): string {
  return `${stamp} - ${sanitizeSegment(label)}`;
}

/** Remove `fileName.png` from `folder` if it is there. */
export async function removeExportFile(folder: ExportFolder, fileName: string): Promise<void> {
  const uri = folder.children.get(`${fileName}.png`);
  if (!uri) return;
  await StorageAccessFramework.deleteAsync(uri, { idempotent: true });
  folder.children.delete(`${fileName}.png`);
}

/**
 * Clear out anything this folder holds for `stamp` under the old
 * `Statement~<stamp>~<id>~<label>~<fingerprint>.png` scheme.
 *
 * Only for the day being exported, so a folder full of other days keeps them
 * until they are re-exported under the new name in their turn.
 */
export async function removeLegacyExports(folder: ExportFolder, stamp: string): Promise<void> {
  const prefix = `Statement~${stamp}~`;
  for (const [name, uri] of Array.from(folder.children)) {
    if (!name.startsWith(prefix)) continue;
    await StorageAccessFramework.deleteAsync(uri, { idempotent: true });
    folder.children.delete(name);
  }
}
