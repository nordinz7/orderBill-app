import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { createAndShareBackup, pickAndRestoreBackup } from '@/utils/backup';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
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
  });
}

export default function BackupScreen() {
  const db = useSQLiteContext();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastBackup, setLastBackup] = useState<Date | null>(null);

  const handleBackup = async () => {
    setLoading(true);
    try {
      await createAndShareBackup(db);
      setLastBackup(new Date());
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

  return (
    <ScrollView style={S.container} contentContainerStyle={{ paddingBottom: Spacing.xxl * 2 }}>
      {/* ── Create Backup ── */}
      <View style={S.card}>
        <MaterialIcons name="cloud-upload" size={72} color={colors.primary} style={{ marginBottom: Spacing.lg }} />
        <Text style={S.title}>{tr.backupTitle}</Text>
        <Text style={S.description}>{tr.backupDesc}</Text>
        {lastBackup && (
          <Text style={S.lastBackup}>{tr.lastBackup}: {format(lastBackup, 'dd MMM yyyy, hh:mm a')}</Text>
        )}
        <TouchableOpacity style={[S.button, loading && S.buttonDisabled]} onPress={handleBackup} disabled={loading || restoring}>
          {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
            <>
              <MaterialIcons name="save-alt" size={24} color="#FFFFFF" />
              <Text style={S.buttonText}>{tr.createBackup}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Restore from Backup ── */}
      <View style={S.card}>
        <MaterialIcons name="cloud-download" size={72} color={colors.primary} style={{ marginBottom: Spacing.lg }} />
        <Text style={S.title}>{tr.restoreTitle}</Text>
        <Text style={S.description}>{tr.restoreDesc}</Text>
        <TouchableOpacity style={[S.restoreButton, restoring && S.buttonDisabled]} onPress={handleRestore} disabled={loading || restoring}>
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
