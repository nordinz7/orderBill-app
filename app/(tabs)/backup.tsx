import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { backupToGoogleDrive, createAndShareBackup, getLastBackupDate, isBackupOverdue, pickAndRestoreBackup } from '@/utils/backup';
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
    title:       { fontSize: FontSizes.xxl, fontWeight: '800', color: c.text, marginBottom: Spacing.md, textAlign: 'center' },
    description: { fontSize: FontSizes.md, color: c.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.lg },
    lastBackup:  { fontSize: FontSizes.sm, color: c.primary, marginBottom: Spacing.lg, fontWeight: '600' },
    button: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: c.primary,
      paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xxl,
      borderRadius: Radius.lg, minWidth: 200, justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText:    { color: '#FFFFFF', fontSize: FontSizes.lg, fontWeight: '700' },
    infoCard:      { backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.xl, elevation: 2 },
    infoTitle:     { fontSize: FontSizes.lg, fontWeight: '700', color: c.text, marginBottom: Spacing.md },
    infoRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    infoText:      { fontSize: FontSizes.md, color: c.textSecondary, flex: 1 },
    restoreButton: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: c.card,
      borderWidth: 2, borderColor: c.primary,
      paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xxl,
      borderRadius: Radius.lg, minWidth: 200, justifyContent: 'center',
    },
    restoreButtonText: { color: c.primary, fontSize: FontSizes.lg, fontWeight: '700' },
    divider:       { height: 1, backgroundColor: c.border, marginVertical: Spacing.xl },
    warningCard:   { backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.xl, elevation: 2, marginTop: Spacing.xl },
    overdueCard: {
      backgroundColor: '#FFF3CD', borderRadius: Radius.lg, padding: Spacing.xl,
      marginBottom: Spacing.xl, borderWidth: 1, borderColor: '#FFECB5',
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    },
    overdueText: { fontSize: FontSizes.md, color: '#856404', flex: 1, fontWeight: '600' },
    driveButton: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: '#1A73E8',
      paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xxl,
      borderRadius: Radius.lg, minWidth: 200, justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    driveButtonText: { color: '#FFFFFF', fontSize: FontSizes.lg, fontWeight: '700' },
    secondaryButton: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: 'transparent',
      paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
      borderRadius: Radius.lg, justifyContent: 'center',
    },
    secondaryButtonText: { color: c.textSecondary, fontSize: FontSizes.md, fontWeight: '600' },
    hintText: { fontSize: FontSizes.sm, color: c.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
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

  // Load persisted backup date on mount
  useEffect(() => {
    (async () => {
      const date = await getLastBackupDate();
      setLastBackup(date);
      setOverdue(await isBackupOverdue());
    })();
  }, []);

  const refreshBackupState = async () => {
    const date = await getLastBackupDate();
    setLastBackup(date);
    setOverdue(await isBackupOverdue());
  };

  const handleGoogleDrive = async () => {
    setLoading(true);
    try {
      await backupToGoogleDrive(db);
      await refreshBackupState();
    } catch {
      Alert.alert(tr.backupFailed, tr.backupFailedMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleShareBackup = async () => {
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

  const handleRestore = () => {
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

  const busy = loading || restoring;

  return (
    <ScrollView style={S.container} contentContainerStyle={{ paddingBottom: Spacing.xxl * 2 }}>
      {/* ── Overdue / Never-backed-up Warning ── */}
      {overdue && (
        <View style={S.overdueCard}>
          <MaterialIcons name="warning" size={28} color="#856404" />
          <Text style={S.overdueText}>
            {lastBackup ? tr.backupOverdueMsg : tr.neverBackedUp}
          </Text>
        </View>
      )}

      {/* ── Google Drive (Primary) ── */}
      <View style={S.card}>
        <MaterialIcons name="cloud-upload" size={72} color="#1A73E8" style={{ marginBottom: Spacing.lg }} />
        <Text style={S.title}>{tr.saveToGoogleDrive}</Text>
        <Text style={S.hintText}>{tr.googleDriveHint}</Text>
        {lastBackup && (
          <Text style={S.lastBackup}>{tr.lastBackup}: {format(lastBackup, 'dd MMM yyyy, hh:mm a')}</Text>
        )}
        <TouchableOpacity style={[S.driveButton, busy && S.buttonDisabled]} onPress={handleGoogleDrive} disabled={busy}>
          {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
            <>
              <MaterialIcons name="add-to-drive" size={24} color="#FFFFFF" />
              <Text style={S.driveButtonText}>{tr.saveToGoogleDrive}</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={S.secondaryButton} onPress={handleShareBackup} disabled={busy}>
          <MaterialIcons name="share" size={20} color={colors.textSecondary} />
          <Text style={S.secondaryButtonText}>{tr.shareBackup}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Restore from Backup ── */}
      <View style={S.card}>
        <MaterialIcons name="cloud-download" size={72} color={colors.primary} style={{ marginBottom: Spacing.lg }} />
        <Text style={S.title}>{tr.restoreTitle}</Text>
        <Text style={S.description}>{tr.restoreDesc}</Text>
        <TouchableOpacity style={[S.restoreButton, restoring && S.buttonDisabled]} onPress={handleRestore} disabled={busy}>
          {restoring ? <ActivityIndicator color={colors.primary} size="small" /> : (
            <>
              <MaterialIcons name="restore" size={24} color={colors.primary} />
              <Text style={S.restoreButtonText}>{tr.restoreButton}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── What's Backed Up ── */}
      <View style={S.infoCard}>
        <Text style={S.infoTitle}>{tr.whatBackedUp}</Text>
        {[tr.backupItem1, tr.backupItem2, tr.backupItem3].map((item, i) => (
          <View style={S.infoRow} key={i}>
            <MaterialIcons name="check-circle" size={20} color={colors.success} />
            <Text style={S.infoText}>{item}</Text>
          </View>
        ))}
      </View>

      {/* ── Backup Recommendations ── */}
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
