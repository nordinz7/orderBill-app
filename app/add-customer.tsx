import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { addCustomer } from '@/services/database';
import { useSettings } from '@/contexts/SettingsContext';
import { AppColors, FontSizes, Spacing, Radius } from '@/constants/theme';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:          { flex: 1, backgroundColor: c.background },
    scrollContent:      { padding: Spacing.xl, gap: Spacing.lg },
    field:              { gap: Spacing.xs },
    label:              { fontSize: FontSizes.md, fontWeight: '700', color: c.text },
    input: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.lg, fontSize: FontSizes.lg, color: c.text,
    },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: Radius.md,
    },
    phonePrefix: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.lg,
      fontSize: FontSizes.lg,
      fontWeight: '700',
      color: c.primary,
      borderRightWidth: 1.5,
      borderRightColor: c.border,
    },
    phoneInput: {
      flex: 1,
      padding: Spacing.lg,
      fontSize: FontSizes.lg,
      color: c.text,
    },
    hint:               { fontSize: FontSizes.sm, color: c.textMuted },
    saveButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: Spacing.sm, backgroundColor: c.primary,
      padding: Spacing.xl, borderRadius: Radius.lg, marginTop: Spacing.md,
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText:     { color: '#FFFFFF', fontSize: FontSizes.xl, fontWeight: '700' },
  });
}

export default function AddCustomerScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);

  const [name, setName]     = useState('');
  const [place, setPlace]   = useState('');
  const [phone, setPhone]   = useState('');
  const [saving, setSaving] = useState(false);

  const fullPhone = () => '91' + phone.replace(/\D/g, '');

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert(tr.required, tr.enterName); return; }
    setSaving(true);
    try {
      await addCustomer(db, name, place, fullPhone());
      router.back();
    } catch {
      Alert.alert('Error', tr.couldNotSave);
    } finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={S.container} contentContainerStyle={S.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="person" size={16} color={colors.text} /> {tr.name} *</Text>
          <TextInput style={S.input} value={name} onChangeText={setName} placeholder={tr.namePlaceholder} placeholderTextColor={colors.textMuted} autoFocus returnKeyType="next" />
        </View>
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="location-on" size={16} color={colors.text} /> {tr.place}</Text>
          <TextInput style={S.input} value={place} onChangeText={setPlace} placeholder={tr.placePlaceholder} placeholderTextColor={colors.textMuted} returnKeyType="next" />
        </View>
        <View style={S.field}>
          <Text style={S.label}><MaterialCommunityIcons name="whatsapp" size={16} color={colors.text} /> {tr.whatsappNumber}</Text>
          <View style={S.phoneRow}>
            <Text style={S.phonePrefix}>+91</Text>
            <TextInput style={S.phoneInput} value={phone} onChangeText={setPhone} placeholder={tr.phonePlaceholder} placeholderTextColor={colors.textMuted} keyboardType="phone-pad" returnKeyType="done" maxLength={10} />
          </View>
          <Text style={S.hint}>{tr.includeCountryCode}</Text>
        </View>
        <TouchableOpacity style={[S.saveButton, saving && S.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          <MaterialIcons name="check" size={24} color="#FFFFFF" />
          <Text style={S.saveButtonText}>{saving ? tr.saving : tr.save}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
