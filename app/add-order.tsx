import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { addOrder, Customer, findDuplicateOrder, getActiveCustomers } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
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
    searchInput: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.md, fontSize: FontSizes.lg, color: c.text,
      marginHorizontal: Spacing.xl, marginTop: Spacing.md, marginBottom: Spacing.xs,
    },
    dateButton: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.lg, flexDirection: 'row',
      alignItems: 'center', justifyContent: 'space-between',
    },
    dateButtonText:     { fontSize: FontSizes.lg, color: c.text },
  });
}

export default function AddOrderScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr, defaultOrderDescription } = useSettings();
  const S = makeStyles(colors);
  const params = useLocalSearchParams<{ defaultDate?: string }>();

  const [customers, setCustomers]           = useState<Customer[]>([]);
  const [selectedCustomer, setSelected]     = useState<Customer | null>(null);
  const [showPicker, setShowPicker]         = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [quantity, setQuantity]             = useState('');
  const [description, setDescription]       = useState(defaultOrderDescription || 'Kuboos');
  const [saving, setSaving]                 = useState(false);

  const [orderDate, setOrderDate]           = useState<Date>(() => {
    if (params.defaultDate) {
      const d = new Date(params.defaultDate);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setOrderDate(date);
  };

  useEffect(() => { getActiveCustomers(db).then(setCustomers); }, [db]);

  const handleSave = async () => {
    if (!selectedCustomer) { Alert.alert(tr.required, tr.pleaseSelectCustomer); return; }
    if (!description.trim()) { Alert.alert(tr.required, tr.enterDesc); return; }

    // Check for duplicate order (same customer + date + description)
    const dateStr = orderDate.toISOString().slice(0, 10);
    const existing = await findDuplicateOrder(db, selectedCustomer.id, dateStr, description);
    if (existing) {
      Alert.alert(tr.duplicateOrderTitle, tr.duplicateOrderMsg(selectedCustomer.name, existing.quantity), [
        { text: tr.cancel, style: 'cancel' },
        {
          text: tr.editExisting, onPress: () => {
            router.replace({
              pathname: '/edit-order',
              params: {
                orderId: existing.id,
                customerName: `${existing.customer_name} — ${existing.customer_place}`,
                amount: String(existing.amount),
                description: existing.description,
                quantity: String(existing.quantity),
                date: existing.date,
              },
            });
          },
        },
        {
          text: tr.addNew, onPress: async () => {
            setSaving(true);
            try {
              const qty = parseInt(quantity, 10) || 0;
              await addOrder(db, selectedCustomer.id, 0, description, qty, orderDate.toISOString());
              router.back();
            } catch {
              Alert.alert('Error', tr.couldNotSave);
            } finally { setSaving(false); }
          },
        },
      ]);
      return;
    }

    setSaving(true);
    try {
      const qty = parseInt(quantity, 10) || 0;
      await addOrder(db, selectedCustomer.id, 0, description, qty, orderDate.toISOString());
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
          <Text style={S.label}><MaterialIcons name="event" size={16} color={colors.text} /> {tr.orderDate}</Text>
          <TouchableOpacity style={S.dateButton} onPress={() => setShowDatePicker(true)}>
            <Text style={S.dateButtonText}>{format(orderDate, 'dd MMM yyyy, EEEE')}</Text>
            <MaterialIcons name="calendar-today" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={orderDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onDateChange}
              themeVariant={colors.background === '#000000' || colors.background === '#121212' ? 'dark' : 'light'}
            />
          )}
        </View>
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="scale" size={16} color={colors.text} /> {tr.quantity}</Text>
          <TextInput style={S.input} value={quantity} onChangeText={t => setQuantity(t.replace(/[^0-9]/g, ''))} placeholder={tr.quantityPlaceholder} placeholderTextColor={colors.textMuted} keyboardType="number-pad" returnKeyType="next" />
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
