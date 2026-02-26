import { getAllDataForBackup, isValidBackup, restoreFromBackupData } from '@/services/database';
import { format } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Alert } from 'react-native';

/**
 * Creates a JSON backup of all customers and orders, then triggers
 * the Android share sheet so the user can save it to Google Drive, etc.
 */
export async function createAndShareBackup(db: SQLiteDatabase): Promise<void> {
  try {
    const data = await getAllDataForBackup(db);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      customers: data.customers,
      orders: data.orders,
    };

    const json = JSON.stringify(payload, null, 2);
    const dateStamp = format(new Date(), 'yyyy-MM-dd_HHmm');
    const fileName = `mfc-backup-${dateStamp}.json`;

    // Write using new expo-file-system File API
    const file = new File(Paths.cache, fileName);
    file.write(json);

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert(
        'Sharing Not Available',
        `Backup file saved.`
      );
      return;
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save MFC Backup',
      UTI: 'public.json',
    });
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
  const contents = file.text();
  const parsed = JSON.parse(contents);

  if (!isValidBackup(parsed)) {
    return null;
  }

  return restoreFromBackupData(db, parsed);
}
