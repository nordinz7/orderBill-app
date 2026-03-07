import { getAllDataForBackup, isValidBackup, restoreFromBackupData } from '@/services/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { differenceInDays, format } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Alert } from 'react-native';

const LAST_BACKUP_KEY = '@mfc_last_backup';
const LAST_LOCAL_BACKUP_KEY = '@mfc_last_local_backup';
const BACKUP_PREFIX = 'mfc-auto-backup-';

/** Returns a user-friendly path string for the auto-backup directory. */
export function getBackupDirectoryPath(): string {
  // Derive path from a temp file reference since Paths.document.uri may not work directly
  const tempFile = new File(Paths.document, '__probe__');
  const fullUri = tempFile.uri.replace('file://', '');
  return fullUri.replace('/__probe__', '');
}
const MAX_ROLLING_BACKUPS = 5;

// ─── Persistence helpers ──────────────────────────────────────────────────────

/** Save the current timestamp as the last backup date. */
export async function saveLastBackupDate(): Promise<void> {
  await AsyncStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

/** Read the persisted last-backup date (or null if never backed up). */
export async function getLastBackupDate(): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(LAST_BACKUP_KEY);
  return raw ? new Date(raw) : null;
}

/** Returns true when 7+ days have passed since the last backup (or never backed up). */
export async function isBackupOverdue(): Promise<boolean> {
  const last = await getLastBackupDate();
  if (!last) return true;
  return differenceInDays(new Date(), last) >= 7;
}

// ─── Rolling auto backup ─────────────────────────────────────────────────────

function getRollingFilename(date: Date): string {
  return `${BACKUP_PREFIX}${format(date, 'yyyy-MM-dd')}.json`;
}

/** Returns all rolling backup files sorted newest-first. */
export function getLocalBackupFiles(): { uri: string; filename: string; date: string }[] {
  try {
    const dir = new Directory(Paths.document);
    const entries = dir.list();
    const backups: { uri: string; filename: string; date: string }[] = [];

    for (const entry of entries) {
      if (entry instanceof File && entry.name.startsWith(BACKUP_PREFIX) && entry.name.endsWith('.json')) {
        const dateStr = entry.name.replace(BACKUP_PREFIX, '').replace('.json', '');
        backups.push({ uri: entry.uri, filename: entry.name, date: dateStr });
      }
    }

    backups.sort((a, b) => b.date.localeCompare(a.date));
    return backups;
  } catch {
    return [];
  }
}

/** Remove old backups beyond MAX_ROLLING_BACKUPS. */
function pruneOldBackups(): void {
  const backups = getLocalBackupFiles();
  if (backups.length <= MAX_ROLLING_BACKUPS) return;

  for (let i = MAX_ROLLING_BACKUPS; i < backups.length; i++) {
    try {
      const file = new File(backups[i].uri);
      file.delete();
    } catch {
      // ignore deletion errors
    }
  }
}

/** Save a rolling JSON backup (one per day, max 5 kept). */
export async function saveLocalBackup(db: SQLiteDatabase): Promise<void> {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const lastRaw = await AsyncStorage.getItem(LAST_LOCAL_BACKUP_KEY);
    const lastDate = lastRaw ? lastRaw.slice(0, 10) : null;

    // Skip if already backed up today
    if (lastDate === today) return;

    const data = await getAllDataForBackup(db);
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 2,
      customers: data.customers,
      orders: data.orders,
      transactions: data.transactions,
      statements: data.statements,
      statement_transactions: data.statement_transactions,
    };
    const json = JSON.stringify(payload, null, 2);
    const file = new File(Paths.document, getRollingFilename(new Date()));
    file.write(json);

    await AsyncStorage.setItem(LAST_LOCAL_BACKUP_KEY, new Date().toISOString());
    pruneOldBackups();
  } catch (e) {
    console.warn('Auto local backup failed:', e);
  }
}

/** Read the last auto-backup date. */
export async function getLastLocalBackupDate(): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(LAST_LOCAL_BACKUP_KEY);
  return raw ? new Date(raw) : null;
}

/** Get the URI of the most recent rolling backup file (or null). */
export function getLocalBackupUri(): string | null {
  const backups = getLocalBackupFiles();
  return backups.length > 0 ? backups[0].uri : null;
}

/** Restore from a specific local backup file URI. */
export async function restoreFromLocalBackup(
  db: SQLiteDatabase,
  uri: string,
): Promise<{ customers: number; orders: number } | null> {
  const file = new File(uri);
  const contents = await file.text();
  const parsed = JSON.parse(contents);

  if (!isValidBackup(parsed)) return null;
  return restoreFromBackupData(db, parsed);
}

// ─── Backup file creation ─────────────────────────────────────────────────────

/**
 * Creates a JSON backup file in the cache directory and returns its URI.
 * Separated from sharing so callers can choose how to distribute the file.
 */
export async function createBackupFile(
  db: SQLiteDatabase,
): Promise<{ uri: string; fileName: string }> {
  const data = await getAllDataForBackup(db);

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 2,
    customers: data.customers,
    orders: data.orders,
    transactions: data.transactions,
    statements: data.statements,
    statement_transactions: data.statement_transactions,
  };

  const json = JSON.stringify(payload, null, 2);
  const dateStamp = format(new Date(), 'yyyy-MM-dd_HHmm');
  const fileName = `mfc-backup-${dateStamp}.json`;

  const file = new File(Paths.cache, fileName);
  file.write(json);

  return { uri: file.uri, fileName };
}

// ─── Share helpers ────────────────────────────────────────────────────────────

async function ensureSharingAvailable(): Promise<boolean> {
  const ok = await Sharing.isAvailableAsync();
  if (!ok) {
    Alert.alert('Sharing Not Available', 'Backup file saved locally.');
  }
  return ok;
}

/**
 * Creates a JSON backup and opens the general Android share sheet.
 */
export async function createAndShareBackup(db: SQLiteDatabase): Promise<void> {
  try {
    const { uri } = await createBackupFile(db);
    if (!(await ensureSharingAvailable())) return;

    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save MFC Backup',
      UTI: 'public.json',
    });

    await saveLastBackupDate();
  } catch (error) {
    console.error('Backup error:', error);
    Alert.alert('Backup Failed', 'An error occurred while creating the backup.');
  }
}


/**
 * Opens a document picker, reads the selected JSON backup file,
 * validates it, and restores the data into the database.
 * Returns { customers, orders } counts on success, or null on cancel/failure.
 */
export async function pickAndRestoreBackup(
  db: SQLiteDatabase,
): Promise<{ customers: number; orders: number } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];
  const file = new File(asset.uri);
  const contents = await file.text();
  const parsed = JSON.parse(contents);

  if (!isValidBackup(parsed)) {
    return null;
  }

  return restoreFromBackupData(db, parsed);
}
