import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { createAndShareBackup } from '@/utils/backup';
import { useSettings } from '@/contexts/SettingsContext';
import { AppColors, FontSizes, Spacing, Radius } from '@/constants/theme';

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
  });
}

export default function BackupScreen() {
  const db = useSQLiteContext();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);
  const [loading, setLoading] = useState(false);
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

  return (
    <View style={S.container}>
      <View style={S.card}>
        <MaterialIcons name="cloud-upload" size={72} color={colors.primary} style={{ marginBottom: Spacing.lg }} />
        <Text style={S.title}>{tr.backupTitle}</Text>
        <Text style={S.description}>{tr.backupDesc}</Text>
        {lastBackup && (
          <Text style={S.lastBackup}>{tr.lastBackup}: {format(lastBackup, 'dd MMM yyyy, hh:mm a')}</Text>
        )}
        <TouchableOpacity style={[S.button, loading && S.buttonDisabled]} onPress={handleBackup} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
            <>
              <MaterialIcons name="save-alt" size={24} color="#FFFFFF" />
              <Text style={S.buttonText}>{tr.createBackup}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={S.infoCard}>
        <Text style={S.infoTitle}>{tr.whatBackedUp}</Text>
        {[tr.backupItem1, tr.backupItem2, tr.backupItem3].map((item, i) => (
          <View style={S.infoRow} key={i}>
            <MaterialIcons name="check-circle" size={20} color={colors.success} />
            <Text style={S.infoText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
