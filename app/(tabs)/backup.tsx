import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
  createAndShareBackup,
  getBackupDirectoryPath,
  getLastBackupDate,
  getLocalBackupFiles,
  isBackupOverdue,
  pickAndRestoreBackup,
  restoreFromLocalBackup,
} from '@/utils/backup';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background, padding: Spacing.xl },
    card: {
      backgroundColor: c.card, borderRadius: Radius.xl,
      padding: Spacing.xxl, alignItems: 'center',
      elevation: 3, shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1, shadowRadius: 6,
      marginBottom: Spacing.xl,
    },
    title: { fontSize: FontSizes.xxl, fontWeight: '800', color: c.text, marginBottom: Spacing.md, textAlign: 'center' },
    hintText: { fontSize: FontSizes.sm, color: c.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
    lastBackup: { fontSize: FontSizes.sm, color: c.primary, marginBottom: Spacing.lg, fontWeight: '600' },
    button: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: c.primary,
      paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xxl,
      borderRadius: Radius.lg, minWidth: 200, justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#FFFFFF', fontSize: FontSizes.lg, fontWeight: '700' },
    restoreButton: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: c.card,
      borderWidth: 2, borderColor: c.primary,
      paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xxl,
      borderRadius: Radius.lg, minWidth: 200, justifyContent: 'center',
    },
    restoreButtonText: { color: c.primary, fontSize: FontSizes.lg, fontWeight: '700' },
    description: { fontSize: FontSizes.md, color: c.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.lg },
    infoCard: { backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.xl, elevation: 2 },
    infoTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: c.text, marginBottom: Spacing.md },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    infoText: { fontSize: FontSizes.md, color: c.textSecondary, flex: 1 },
    overdueCard: {
      backgroundColor: '#FFF3CD', borderRadius: Radius.lg, padding: Spacing.xl,
      marginBottom: Spacing.xl, borderWidth: 1, borderColor: '#FFECB5',
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    },
    overdueText: { fontSize: FontSizes.md, color: '#856404', flex: 1, fontWeight: '600' },
    autoBackupCard: {
      backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.xl,
      elevation: 2, marginBottom: Spacing.xl,
    },
    autoBackupHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
    autoBackupTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: c.text, flex: 1 },
    autoBackupBadge: {
      backgroundColor: c.successLight, paddingHorizontal: Spacing.sm, paddingVertical: 2,
      borderRadius: Radius.sm,
    },
    autoBackupBadgeText: { fontSize: FontSizes.xs, fontWeight: '700', color: c.success },
    backupFileRow: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: c.separator,
    },
    backupFileName: { fontSize: FontSizes.sm, color: c.text, flex: 1 },
    backupFileDate: { fontSize: FontSizes.xs, color: c.textMuted },
    restoreFileBtn: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
    restoreFileBtnText: { fontSize: FontSizes.sm, color: c.primary, fontWeight: '600' },
    emptyBackupText: { fontSize: FontSizes.sm, color: c.textMuted, fontStyle: 'italic' },
    locationRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
      backgroundColor: c.background, borderRadius: Radius.sm,
      padding: Spacing.sm, marginTop: Spacing.md,
    },
    locationPath: { fontSize: FontSizes.xs, color: c.textMuted, flex: 1, fontFamily: 'monospace' },
    warningCard: { backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.xl, elevation: 2, marginTop: Spacing.xl },
    divider: { height: 1, backgroundColor: c.border, marginVertical: Spacing.xl },
  });
}

export default function BackupScreen() {
  const db = useSQLiteContext();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastBackup, setLastBackup] = useState<Date | null>(null);
  const [overdue, setOverdue] = useState(false);
  const [backupFiles, setBackupFiles] = useState<{ uri: string; filename: string; date: string }[]>([]);
  const [backupDir, setBackupDir] = useState('');

  useEffect(() => {
    (async () => {
      const date = await getLastBackupDate();
      setLastBackup(date);
      setOverdue(await isBackupOverdue());
      setBackupFiles(getLocalBackupFiles());
      try { setBackupDir(getBackupDirectoryPath()); } catch { /* ignore */ }
    })();
  }, []);

  const refreshBackupState = async () => {
    const date = await getLastBackupDate();
    setLastBackup(date);
    setOverdue(await isBackupOverdue());
    setBackupFiles(getLocalBackupFiles());
  };

  const handleSaveBackup = async () => {
    setLoading(true);
    try {
      await createAndShareBackup(db);
      await refreshBackupState();
    } catch {
      Alert.alert(tr.backupFailed, tr.backupFailedMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreFromFile = () => {
    Alert.alert(tr.restoreConfirm, tr.restoreConfirmMsg, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.proceed,
        style: 'destructive',
        onPress: async () => {
          setRestoring(true);
          try {
            const result = await pickAndRestoreBackup(db);
            if (result) {
              Alert.alert(tr.restoreSuccess, tr.restoreSuccessMsg(result.customers, result.orders));
            }
          } catch {
            Alert.alert(tr.restoreFailed, tr.restoreFailedMsg);
          } finally {
            setRestoring(false);
          }
        },
      },
    ]);
  };

  const handleRestoreFromAutoBackup = (uri: string, dateStr: string) => {
    Alert.alert(tr.restoreConfirm, tr.restoreConfirmMsg, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.proceed,
        style: 'destructive',
        onPress: async () => {
          setRestoring(true);
          try {
            const result = await restoreFromLocalBackup(db, uri);
            if (result) {
              Alert.alert(tr.restoreSuccess, tr.restoreSuccessMsg(result.customers, result.orders));
            } else {
              Alert.alert(tr.restoreFailed, tr.restoreFailedMsg);
            }
          } catch {
            Alert.alert(tr.restoreFailed, tr.restoreFailedMsg);
          } finally {
            setRestoring(false);
          }
        },
      },
    ]);
  };

  const busy = loading || restoring;

  return (
    <ScrollView style={S.container} contentContainerStyle={{ paddingBottom: Spacing.xxl * 2 }}>
      {/* Overdue Warning */}
      {overdue && (
        <View style={S.overdueCard}>
          <MaterialIcons name="warning" size={28} color="#856404" />
          <Text style={S.overdueText}>
            {lastBackup ? tr.backupOverdueMsg : tr.neverBackedUp}
          </Text>
        </View>
      )}

      {/* Save Backup */}
      <View style={S.card}>
        <MaterialIcons name="save" size={72} color={colors.primary} style={{ marginBottom: Spacing.lg }} />
        <Text style={S.title}>{tr.saveBackup}</Text>
        <Text style={S.hintText}>{tr.saveBackupHint}</Text>
        {lastBackup && (
          <Text style={S.lastBackup}>{tr.lastBackup}: {format(lastBackup, 'dd MMM yyyy, hh:mm a')}</Text>
        )}
        <TouchableOpacity style={[S.button, busy && S.buttonDisabled]} onPress={handleSaveBackup} disabled={busy}>
          {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
            <>
              <MaterialIcons name="file-download" size={24} color="#FFFFFF" />
              <Text style={S.buttonText}>{tr.saveBackup}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Auto-backups List */}
      <View style={S.autoBackupCard}>
        <View style={S.autoBackupHeader}>
          <MaterialIcons name="history" size={24} color={colors.primary} />
          <Text style={S.autoBackupTitle}>{tr.autoBackup}</Text>
          <View style={S.autoBackupBadge}>
            <Text style={S.autoBackupBadgeText}>{tr.autoBackupActive}</Text>
          </View>
        </View>
        <Text style={[S.infoText, { marginBottom: Spacing.md }]}>{tr.autoBackupDesc}</Text>
        {backupFiles.length === 0 ? (
          <Text style={S.emptyBackupText}>{tr.autoBackupsInfo(0, '')}</Text>
        ) : (
          backupFiles.map((bf) => (
            <View style={S.backupFileRow} key={bf.filename}>
              <MaterialIcons name="insert-drive-file" size={18} color={colors.textMuted} />
              <Text style={S.backupFileName}>{bf.date}</Text>
              <TouchableOpacity
                style={S.restoreFileBtn}
                onPress={() => handleRestoreFromAutoBackup(bf.uri, bf.date)}
                disabled={busy}
              >
                <Text style={S.restoreFileBtnText}>{tr.restoreButton}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        {backupDir ? (
          <View style={S.locationRow}>
            <MaterialIcons name="folder" size={14} color={colors.textMuted} />
            <Text style={S.locationPath} selectable>{backupDir}</Text>
          </View>
        ) : null}
      </View>

      {/* Restore from File */}
      <View style={S.card}>
        <MaterialIcons name="folder-open" size={72} color={colors.primary} style={{ marginBottom: Spacing.lg }} />
        <Text style={S.title}>{tr.restoreTitle}</Text>
        <Text style={S.description}>{tr.restoreDesc}</Text>
        <TouchableOpacity style={[S.restoreButton, restoring && S.buttonDisabled]} onPress={handleRestoreFromFile} disabled={busy}>
          {restoring ? <ActivityIndicator color={colors.primary} size="small" /> : (
            <>
              <MaterialIcons name="restore" size={24} color={colors.primary} />
              <Text style={S.restoreButtonText}>{tr.restoreFromFile}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* What's Backed Up */}
      <View style={S.infoCard}>
        <Text style={S.infoTitle}>{tr.whatBackedUp}</Text>
        {[tr.backupItem1, tr.backupItem2, tr.backupItem3].map((item, i) => (
          <View style={S.infoRow} key={i}>
            <MaterialIcons name="check-circle" size={20} color={colors.success} />
            <Text style={S.infoText}>{item}</Text>
          </View>
        ))}
      </View>

      {/* Backup Recommendations */}
      <View style={S.warningCard}>
        <Text style={S.infoTitle}>{tr.backupPlanTitle}</Text>
        {[tr.backupPlanItem1, tr.backupPlanItem2, tr.backupPlanItem3].map((item, i) => (
          <View style={S.infoRow} key={i}>
            <MaterialIcons name="info" size={20} color={colors.primary} />
            <Text style={S.infoText}>{item}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
