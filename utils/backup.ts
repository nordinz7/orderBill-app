import { getAllDataForBackup, isValidBackup, restoreFromBackupData } from '@/services/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { differenceInDays, format } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Alert } from 'react-native';

const LAST_BACKUP_KEY = '@mfc_last_backup';

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
 * Creates a JSON backup and opens the share sheet with a Google Drive prompt.
 * On Android the system share sheet appears — the dialog title reminds the
 * user to choose Google Drive.  This is the most reliable cross-device
 * approach without requiring Google OAuth.
 */
export async function backupToGoogleDrive(db: SQLiteDatabase): Promise<void> {
  try {
    const { uri } = await createBackupFile(db);
    if (!(await ensureSharingAvailable())) return;

    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: '📁 Choose "Google Drive" to save your backup',
      UTI: 'public.json',
    });

    await saveLastBackupDate();
  } catch (error) {
    console.error('Google Drive backup error:', error);
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
