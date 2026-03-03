import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { Customer, getActiveCustomers, insertPayment } from '@/services/database';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', icon: 'cash' as const, iconType: 'mci' as const },
  { key: 'gpay', label: 'GPay', icon: 'google' as const, iconType: 'mci' as const },
  { key: 'phonepe', label: 'PhonePe', icon: 'cellphone' as const, iconType: 'mci' as const },
  { key: 'paytm', label: 'Paytm', icon: 'wallet' as const, iconType: 'mci' as const },
  { key: 'upi', label: 'UPI', icon: 'bank-transfer' as const, iconType: 'mci' as const },
  { key: 'bank', label: 'Bank', icon: 'bank' as const, iconType: 'mci' as const },
];

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
      gap: Spacing.sm, backgroundColor: c.success,
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
    searchInput: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.md, fontSize: FontSizes.lg, color: c.text,
      marginHorizontal: Spacing.xl, marginTop: Spacing.md, marginBottom: Spacing.xs,
    },
    // Payment method chips
    methodRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    methodChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: Spacing.md, paddingVertical: 8,
      borderRadius: 20, borderWidth: 1.5,
      borderColor: c.border, backgroundColor: c.inputBg,
    },
    methodChipActive:   { borderColor: c.primary, backgroundColor: c.primaryLight },
    methodChipText:     { fontSize: FontSizes.sm, fontWeight: '600', color: c.textSecondary },
    methodChipTextActive: { color: c.primary, fontWeight: '700' },
    dateButton: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.lg, flexDirection: 'row',
      alignItems: 'center', justifyContent: 'space-between',
    },
    dateButtonText:     { fontSize: FontSizes.lg, color: c.text },
  });
}

export default function AddPaymentScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string; customerName?: string; customerPlace?: string }>();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);

  const [customers, setCustomers]           = useState<Customer[]>([]);
  const [selectedCustomer, setSelected]     = useState<Customer | null>(null);
  const [showPicker, setShowPicker]         = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [amount, setAmount]                 = useState('');
  const [description, setDescription]       = useState('Cash');
  const [selectedMethod, setSelectedMethod] = useState<string | null>('cash');
  const [paymentDate, setPaymentDate]       = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving]                 = useState(false);

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setPaymentDate(date);
  };

  useEffect(() => {
    getActiveCustomers(db).then((list) => {
      setCustomers(list);
      if (params.customerId) {
        const found = list.find(c => c.id === Number(params.customerId));
        if (found) setSelected(found);
      }
    });
  }, [db]);

  const handleMethodSelect = (method: typeof PAYMENT_METHODS[number]) => {
    if (selectedMethod === method.key) {
      setSelectedMethod(null);
      setDescription('');
    } else {
      setSelectedMethod(method.key);
      setDescription(method.label);
    }
  };

  const handleSave = async () => {
    if (!selectedCustomer) { Alert.alert(tr.required, tr.pleaseSelectCustomer); return; }
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) { Alert.alert(tr.required, tr.enterAmount); return; }
    setSaving(true);
    try {
      await insertPayment(db, selectedCustomer.id, num, description || tr.paymentReceived, paymentDate.toISOString());
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
          <Text style={S.label}><MaterialIcons name="event" size={16} color={colors.text} /> {tr.paymentDate}</Text>
          <TouchableOpacity style={S.dateButton} onPress={() => setShowDatePicker(true)}>
            <Text style={S.dateButtonText}>{format(paymentDate, 'dd MMM yyyy, EEEE')}</Text>
            <MaterialIcons name="calendar-today" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={paymentDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onDateChange}
              themeVariant={colors.background === '#000000' || colors.background === '#121212' ? 'dark' : 'light'}
            />
          )}
        </View>
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="currency-rupee" size={16} color={colors.text} /> {tr.amount} *</Text>
          <TextInput style={S.input} value={amount} onChangeText={setAmount} placeholder={tr.amountPlaceholder} placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" returnKeyType="next" />
        </View>
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="payments" size={16} color={colors.text} /> {tr.payment}</Text>
          <View style={S.methodRow}>
            {PAYMENT_METHODS.map(m => {
              const active = selectedMethod === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[S.methodChip, active && S.methodChipActive]}
                  onPress={() => handleMethodSelect(m)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={m.icon}
                    size={18}
                    color={active ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[S.methodChipText, active && S.methodChipTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="notes" size={16} color={colors.text} /> {tr.description}</Text>
          <TextInput style={S.input} value={description} onChangeText={(text) => { setDescription(text); if (selectedMethod && text !== PAYMENT_METHODS.find(m => m.key === selectedMethod)?.label) setSelectedMethod(null); }} placeholder={tr.paymentPlaceholder} placeholderTextColor={colors.textMuted} />
        </View>
        <TouchableOpacity style={[S.saveButton, saving && S.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          <MaterialIcons name="payments" size={24} color="#FFFFFF" />
          <Text style={S.saveButtonText}>{saving ? tr.saving : tr.recordPayment}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showPicker} animationType="slide" transparent onRequestClose={() => { setShowPicker(false); setCustomerSearch(''); }}>
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{tr.customers}</Text>
              <TouchableOpacity onPress={() => { setShowPicker(false); setCustomerSearch(''); }}>
                <MaterialIcons name="close" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={S.searchInput}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder={tr.searchCustomers}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            {customers.length === 0 ? (
              <View style={S.noCustomers}>
                <Text style={S.noCustomersText}>{tr.noCustomersYet}</Text>
              </View>
            ) : (
              <FlatList
                data={customers.filter(c => {
                  if (!customerSearch.trim()) return true;
                  const q = customerSearch.toLowerCase();
                  return c.name.toLowerCase().includes(q) || c.place.toLowerCase().includes(q) || c.phone_number.includes(q);
                })}
                keyExtractor={item => String(item.id)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[S.customerOption, selectedCustomer?.id === item.id && S.customerOptionSel]}
                    onPress={() => { setSelected(item); setShowPicker(false); setCustomerSearch(''); }}
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
