import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSettings } from '@/contexts/SettingsContext';
import { AppColors, FontSizes, Spacing, Radius } from '@/constants/theme';
import { Lang } from '@/constants/translations';

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
    appInfoCard: {
      margin: Spacing.lg, backgroundColor: c.card,
      borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center',
    },
    appName:    { fontSize: FontSizes.xxl, fontWeight: '800', color: c.text, marginTop: Spacing.md },
    appVersion: { fontSize: FontSizes.sm, color: c.textMuted, marginTop: Spacing.xs },
  });
}

export default function SettingsScreen() {
  const { colors, tr, isDark, toggleTheme, lang, setLang } = useSettings();
  const S = makeStyles(colors);

  return (
    <View style={S.container}>
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
            <Text style={S.rowLabel}>{tr.language}</Text>
            <View style={S.langBtnRow}>
              {(['en', 'ta'] as Lang[]).map(l => (
                <TouchableOpacity
                  key={l}
                  style={[S.langBtn, lang === l && S.langBtnActive]}
                  onPress={() => setLang(l)}
                >
                  <Text style={[S.langBtnText, lang === l && S.langBtnTextActive]}>
                    {l === 'en' ? tr.english : tr.tamil}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* App info */}
      <View style={S.appInfoCard}>
        <MaterialIcons name="storefront" size={48} color={colors.primary} />
        <Text style={S.appName}>MFC App</Text>
        <Text style={S.appVersion}>v2.0.0 • Local Storage</Text>
      </View>
    </View>
  );
}
