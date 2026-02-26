import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { format } from 'date-fns';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getAllDataForBackup } from '@/services/database';

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
