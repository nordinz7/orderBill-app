import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { Lang } from '@/constants/translations';
import { useSettings } from '@/contexts/SettingsContext';
import { backupToGoogleDrive, createAndShareBackup, getLastBackupDate, isBackupOverdue, pickAndRestoreBackup } from '@/utils/backup';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:   { flex: 1, backgroundColor: c.background },
    section:     { margin: Spacing.lg, marginBottom: 0 },
    sectionTitle:{ fontSize: FontSizes.sm, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm, paddingHorizontal: Spacing.sm },
    card:        { backgroundColor: c.card, borderRadius: Radius.lg, overflow: 'hidden', elevation: 1 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    rowLast:     { borderBottomWidth: 0 },
    rowIcon:     { marginRight: Spacing.lg },
    rowLabel:    { flex: 1, fontSize: FontSizes.lg, color: c.text, fontWeight: '500' },
    rowValue:    { fontSize: FontSizes.md, color: c.textMuted },
    langBtnRow:  { flexDirection: 'row', gap: Spacing.sm },
    langBtn: {
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
      borderRadius: Radius.md, backgroundColor: c.filterInactive,
    },
    langBtnActive: { backgroundColor: c.primary },
    langBtnText:   { fontSize: FontSizes.md, color: c.textSecondary, fontWeight: '600' },
    langBtnTextActive: { color: '#FFFFFF' },
    companyInputFull: {
      flex: 1,
      fontSize: FontSizes.lg,
      color: c.text,
      fontWeight: '600',
      paddingVertical: 0,
    },
    // Backup section
    backupBtnRow: {
      flexDirection: 'row', gap: Spacing.sm,
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    },
    backupBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: Spacing.xs, backgroundColor: '#1A73E8',
      paddingVertical: Spacing.md, borderRadius: Radius.md,
    },
    backupBtnText: { color: '#FFFFFF', fontSize: FontSizes.sm, fontWeight: '700' },
    restoreBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: Spacing.xs, backgroundColor: c.filterInactive,
      paddingVertical: Spacing.md, borderRadius: Radius.md,
    },
    restoreBtnText: { fontSize: FontSizes.sm, fontWeight: '700', color: c.text },
    backupMeta: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md,
    },
    backupMetaText: { fontSize: FontSizes.xs, color: c.textMuted },
    overdueTag: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#FFF3CD', paddingHorizontal: Spacing.sm, paddingVertical: 2,
      borderRadius: Radius.sm,
    },
    overdueTagText: { fontSize: FontSizes.xs, color: '#856404', fontWeight: '700' },
    // Sample statement
    sampleDesc: { fontSize: FontSizes.sm, color: c.textSecondary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm },
    // App info
    appInfoCard: {
      margin: Spacing.lg, backgroundColor: c.card,
      borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center',
    },
    appIcon:    { width: 64, height: 64, borderRadius: 16 },
    appName:    { fontSize: FontSizes.xxl, fontWeight: '800', color: c.text, marginTop: Spacing.md },
    appVersion: { fontSize: FontSizes.sm, color: c.textMuted, marginTop: Spacing.xs },
  });
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr, isDark, toggleTheme, lang, setLang, companyName, setCompanyName, companyPlace, setCompanyPlace } = useSettings();
  const S = makeStyles(colors);

  const [backupLoading, setBackupLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastBackup, setLastBackup] = useState<Date | null>(null);
  const [overdue, setOverdue] = useState(false);

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
    setBackupLoading(true);
    try {
      await backupToGoogleDrive(db);
      await refreshBackupState();
    } catch {
      Alert.alert(tr.backupFailed, tr.backupFailedMsg);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleShareBackup = async () => {
    setBackupLoading(true);
    try {
      await createAndShareBackup(db);
      await refreshBackupState();
    } catch {
      Alert.alert(tr.backupFailed, tr.backupFailedMsg);
    } finally {
      setBackupLoading(false);
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

  const busy = backupLoading || restoring;

  return (
    <ScrollView style={S.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Appearance */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>{tr.theme}</Text>
        <View style={S.card}>
          <View style={[S.row, S.rowLast]}>
            <MaterialIcons name="brightness-6" size={24} color={colors.primary} style={S.rowIcon} />
            <Text style={S.rowLabel}>{tr.darkMode}</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={isDark ? '#FFFFFF' : '#FFFFFF'}
            />
          </View>
        </View>
      </View>

      {/* Language */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>{tr.language}</Text>
        <View style={S.card}>
          <View style={[S.row, S.rowLast]}>
            <MaterialIcons name="language" size={24} color={colors.primary} style={S.rowIcon} />
            <View style={S.langBtnRow}>
              {(['en', 'ta'] as Lang[]).map(l => (
                <TouchableOpacity
                  key={l}
                  style={[S.langBtn, lang === l && S.langBtnActive]}
                  onPress={() => setLang(l)}
                >
                  <Text style={[S.langBtnText, lang === l && S.langBtnTextActive]}>
                    {l === 'en' ? '🇬🇧 ' + tr.english : '🇮🇳 ' + tr.tamil}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Company Details */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>{tr.companyDetails}</Text>
        <View style={S.card}>
          <View style={S.row}>
            <MaterialIcons name="business" size={24} color={colors.primary} style={S.rowIcon} />
            <TextInput
              style={S.companyInputFull}
              value={companyName}
              onChangeText={setCompanyName}
              placeholder={tr.companyNamePlaceholder}
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={[S.row, S.rowLast]}>
            <MaterialIcons name="location-on" size={24} color={colors.primary} style={S.rowIcon} />
            <TextInput
              style={S.companyInputFull}
              value={companyPlace}
              onChangeText={setCompanyPlace}
              placeholder={tr.companyPlacePlaceholder}
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>
      </View>

      {/* Sample Statement Preview */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>{tr.sampleStatement}</Text>
        <View style={S.card}>
          <Text style={S.sampleDesc}>{tr.sampleStatementDesc}</Text>
          <TouchableOpacity
            style={[S.row, S.rowLast]}
            onPress={() => router.push('/preview-statement')}
          >
            <MaterialIcons name="receipt-long" size={24} color={colors.primary} style={S.rowIcon} />
            <Text style={S.rowLabel}>{tr.previewStatement}</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Backup & Restore */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>{tr.backup}</Text>
        <View style={S.card}>
          <View style={S.backupBtnRow}>
            <TouchableOpacity style={S.backupBtn} onPress={handleGoogleDrive} disabled={busy}>
              {backupLoading
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : (
                  <>
                    <MaterialIcons name="cloud-upload" size={18} color="#FFFFFF" />
                    <Text style={S.backupBtnText}>{tr.saveToGoogleDrive}</Text>
                  </>
                )
              }
            </TouchableOpacity>
            <TouchableOpacity style={S.restoreBtn} onPress={handleRestore} disabled={busy}>
              {restoring
                ? <ActivityIndicator color={colors.text} size="small" />
                : (
                  <>
                    <MaterialIcons name="restore" size={18} color={colors.text} />
                    <Text style={S.restoreBtnText}>{tr.restoreButton}</Text>
                  </>
                )
              }
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[S.row, S.rowLast]}
            onPress={handleShareBackup}
            disabled={busy}
          >
            <MaterialIcons name="share" size={20} color={colors.primary} style={S.rowIcon} />
            <Text style={[S.rowLabel, { color: colors.primary }]}>{tr.shareBackup}</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={S.backupMeta}>
            {lastBackup
              ? <Text style={S.backupMetaText}>{tr.lastBackup}: {format(lastBackup, 'dd MMM yyyy, hh:mm a')}</Text>
              : <Text style={S.backupMetaText}>{tr.neverBackedUp}</Text>
            }
            {overdue && (
              <View style={S.overdueTag}>
                <MaterialIcons name="warning" size={12} color="#856404" />
                <Text style={S.overdueTagText}>{tr.backupOverdue}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* App info */}
      <View style={S.appInfoCard}>
        <Image source={require('@/assets/images/icon.png')} style={S.appIcon} />
        <Text style={S.appName}>MFC App</Text>
        <Text style={S.appVersion}>v2.0.0 • Local Storage</Text>
      </View>
    </ScrollView>
  );
}
