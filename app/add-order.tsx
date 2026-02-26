import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, KeyboardAvoidingView,
  Platform, Modal, FlatList,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { getActiveCustomers, addOrder, Customer } from '@/services/database';
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
    textArea:           { minHeight: 100 },
    pickerButton: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.lg, flexDirection: 'row',
      alignItems: 'center', justifyContent: 'space-between',
    },
    pickerText:         { fontSize: FontSizes.lg, color: c.text, flex: 1 },
    pickerPlaceholder:  { color: c.textMuted },
    saveButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: Spacing.sm, backgroundColor: c.primary,
      padding: Spacing.xl, borderRadius: Radius.lg, marginTop: Spacing.md,
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText:     { color: '#FFFFFF', fontSize: FontSizes.xl, fontWeight: '700' },
    modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    modalContent:       { backgroundColor: c.card, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingBottom: 32, maxHeight: '75%' },
    modalHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: c.border },
    modalTitle:         { fontSize: FontSizes.xl, fontWeight: '700', color: c.text },
    customerOption:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: c.separator },
    customerOptionSel:  { backgroundColor: c.primaryLight },
    customerOptionName: { fontSize: FontSizes.lg, fontWeight: '600', color: c.text },
    customerOptionSub:  { fontSize: FontSizes.sm, color: c.textSecondary, marginTop: 2 },
    noCustomers:        { padding: Spacing.xxl, alignItems: 'center' },
    noCustomersText:    { fontSize: FontSizes.lg, color: c.textSecondary, textAlign: 'center' },
  });
}

export default function AddOrderScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);

  const [customers, setCustomers]           = useState<Customer[]>([]);
  const [selectedCustomer, setSelected]     = useState<Customer | null>(null);
  const [showPicker, setShowPicker]         = useState(false);
  const [amount, setAmount]                 = useState('');
  const [description, setDescription]       = useState('');
  const [saving, setSaving]                 = useState(false);

  useEffect(() => { getActiveCustomers(db).then(setCustomers); }, [db]);

  const handleSave = async () => {
    if (!selectedCustomer) { Alert.alert(tr.required, tr.pleaseSelectCustomer); return; }
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) { Alert.alert(tr.required, tr.enterAmount); return; }
    if (!description.trim()) { Alert.alert(tr.required, tr.enterDesc); return; }
    setSaving(true);
    try {
      await addOrder(db, selectedCustomer.id, num, description);
      router.back();
    } catch {
      Alert.alert('Error', tr.couldNotSave);
    } finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={S.container} contentContainerStyle={S.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="person" size={16} color={colors.text} /> {tr.customers} *</Text>
          <TouchableOpacity style={S.pickerButton} onPress={() => setShowPicker(true)}>
            <Text style={[S.pickerText, !selectedCustomer && S.pickerPlaceholder]}>
              {selectedCustomer ? `${selectedCustomer.name} — ${selectedCustomer.place}` : tr.selectCustomer}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="currency-rupee" size={16} color={colors.text} /> {tr.amount} *</Text>
          <TextInput style={S.input} value={amount} onChangeText={setAmount} placeholder={tr.amountPlaceholder} placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" returnKeyType="next" />
        </View>
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="notes" size={16} color={colors.text} /> {tr.description} *</Text>
          <TextInput style={[S.input, S.textArea]} value={description} onChangeText={setDescription} placeholder={tr.descPlaceholder} placeholderTextColor={colors.textMuted} multiline numberOfLines={4} textAlignVertical="top" />
        </View>
        <TouchableOpacity style={[S.saveButton, saving && S.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          <MaterialIcons name="receipt" size={24} color="#FFFFFF" />
          <Text style={S.saveButtonText}>{saving ? tr.saving : tr.saveOrder}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showPicker} animationType="slide" transparent>
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{tr.customers}</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <MaterialIcons name="close" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>
            {customers.length === 0 ? (
              <View style={S.noCustomers}>
                <Text style={S.noCustomersText}>{tr.noCustomersYet}</Text>
              </View>
            ) : (
              <FlatList
                data={customers}
                keyExtractor={item => String(item.id)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[S.customerOption, selectedCustomer?.id === item.id && S.customerOptionSel]}
                    onPress={() => { setSelected(item); setShowPicker(false); }}
                  >
                    <View>
                      <Text style={S.customerOptionName}>{item.name}</Text>
                      <Text style={S.customerOptionSub}>{item.place} · {item.phone_number}</Text>
                    </View>
                    {selectedCustomer?.id === item.id && <MaterialIcons name="check-circle" size={24} color={colors.primary} />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
