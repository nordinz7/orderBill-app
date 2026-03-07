import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { Lang } from '@/constants/translations';
import { useSettings } from '@/contexts/SettingsContext';
import { createAndShareBackup, getLastLocalBackupDate, pickAndRestoreBackup } from '@/utils/backup';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
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
    backupMetaText: { fontSize: FontSizes.xs, color: c.textMuted, marginTop: 2 },
    overdueTag: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: Spacing.sm, paddingVertical: 2,
      borderRadius: Radius.sm,
    },
    overdueTagText: { fontSize: FontSizes.xs, fontWeight: '700' },
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
  const { colors, tr, isDark, toggleTheme, lang, setLang, companyName, setCompanyName, companyPlace, setCompanyPlace, companyPhone, setCompanyPhone, defaultOrderDescription, setDefaultOrderDescription } = useSettings();
  const S = makeStyles(colors);

  const [backupLoading, setBackupLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastLocalBackup, setLastLocalBackup] = useState<Date | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [devTapCount, setDevTapCount] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem('@mfc_dev_mode').then(v => { if (v === 'true') setDevMode(true); });
    getLastLocalBackupDate().then(setLastLocalBackup);
  }, []);

  useEffect(() => {
    (async () => {
      setLastLocalBackup(await getLastLocalBackupDate());
    })();
  }, []);

  const refreshBackupState = async () => {
    setLastLocalBackup(await getLastLocalBackupDate());
  };

  const handleSaveBackup = async () => {
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

  const handleDevTap = useCallback(() => {
    setDevTapCount(prev => {
      const next = prev + 1;
      if (next >= 7) {
        setDevMode(true);
        AsyncStorage.setItem('@mfc_dev_mode', 'true');
        Alert.alert('🛠 Developer Mode', 'Developer mode has been enabled!');
        return 0;
      }
      if (next >= 4) Alert.alert('', `${7 - next} taps to enable developer mode`);
      return next;
    });
  }, []);

  const disableDevMode = useCallback(() => {
    Alert.alert('Disable Developer Mode', 'Are you sure?', [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.proceed, onPress: () => { setDevMode(false); AsyncStorage.setItem('@mfc_dev_mode', 'false'); } },
    ]);
  }, [tr]);

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
          <View style={S.row}>
            <MaterialIcons name="location-on" size={24} color={colors.primary} style={S.rowIcon} />
            <TextInput
              style={S.companyInputFull}
              value={companyPlace}
              onChangeText={setCompanyPlace}
              placeholder={tr.companyPlacePlaceholder}
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={[S.row, S.rowLast]}>
            <MaterialIcons name="phone" size={24} color={colors.primary} style={S.rowIcon} />
            <TextInput
              style={S.companyInputFull}
              value={companyPhone}
              onChangeText={setCompanyPhone}
              placeholder={tr.companyPhonePlaceholder}
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />
          </View>
        </View>
      </View>

      {/* Order Defaults */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>{tr.orderDefaults}</Text>
        <View style={S.card}>
          <View style={[S.row, S.rowLast]}>
            <MaterialIcons name="edit" size={24} color={colors.primary} style={S.rowIcon} />
            <TextInput
              style={S.companyInputFull}
              value={defaultOrderDescription}
              onChangeText={setDefaultOrderDescription}
              placeholder={tr.defaultOrderDescPlaceholder}
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
          {/* Auto-backup status */}
          <View style={S.row}>
            <MaterialIcons name="autorenew" size={24} color={colors.success} style={S.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={S.rowLabel}>{tr.autoBackup}</Text>
              {lastLocalBackup && (
                <Text style={S.backupMetaText}>{tr.lastSaved}: {format(lastLocalBackup, 'dd MMM yyyy, hh:mm a')}</Text>
              )}
            </View>
            <View style={[S.overdueTag, { backgroundColor: colors.successLight }]}>
              <MaterialIcons name="check-circle" size={12} color={colors.success} />
              <Text style={[S.overdueTagText, { color: colors.success }]}>{tr.autoBackupActive}</Text>
            </View>
          </View>
          {/* Save Backup */}
          <TouchableOpacity style={S.row} onPress={handleSaveBackup} disabled={busy}>
            <MaterialIcons name="save" size={24} color={colors.primary} style={S.rowIcon} />
            <Text style={S.rowLabel}>{tr.saveBackup}</Text>
            {backupLoading
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            }
          </TouchableOpacity>
          {/* Restore */}
          <TouchableOpacity style={[S.row, S.rowLast]} onPress={handleRestore} disabled={busy}>
            <MaterialIcons name="restore" size={24} color={colors.textSecondary} style={S.rowIcon} />
            <Text style={S.rowLabel}>{tr.restoreButton}</Text>
            {restoring
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* Developer Mode */}
      {devMode && (
        <View style={S.section}>
          <Text style={S.sectionTitle}>{tr.developerMode}</Text>
          <View style={S.card}>
            <TouchableOpacity style={S.row} onPress={() => router.push('/developer')}>
              <MaterialIcons name="code" size={24} color={colors.primary} style={S.rowIcon} />
              <Text style={S.rowLabel}>{tr.developerTools}</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={[S.row, S.rowLast]} onPress={disableDevMode}>
              <MaterialIcons name="close" size={24} color={colors.danger} style={S.rowIcon} />
              <Text style={[S.rowLabel, { color: colors.danger }]}>{tr.disableDeveloperMode}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* App info */}
      <TouchableOpacity style={S.appInfoCard} onPress={handleDevTap} activeOpacity={0.8}>
        <Image source={require('@/assets/images/icon.png')} style={S.appIcon} />
        <Text style={S.appName}>MFC App</Text>
        <Text style={S.appVersion}>v2.0.0 • Local Storage</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
