import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { updateOrder } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:      { flex: 1, backgroundColor: c.background },
    scrollContent:  { padding: Spacing.xl, gap: Spacing.lg },
    field:          { gap: Spacing.xs },
    label:          { fontSize: FontSizes.md, fontWeight: '700', color: c.text },
    input: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.lg, fontSize: FontSizes.lg, color: c.text,
    },
    textArea:       { minHeight: 100 },
    readOnly:       { backgroundColor: c.card, borderWidth: 1.5, borderColor: c.border, borderRadius: Radius.md, padding: Spacing.lg },
    readOnlyText:   { fontSize: FontSizes.lg, color: c.textSecondary },
    saveButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: Spacing.sm, backgroundColor: c.primary,
      padding: Spacing.xl, borderRadius: Radius.lg, marginTop: Spacing.md,
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: { color: '#FFFFFF', fontSize: FontSizes.xl, fontWeight: '700' },
    dateButton: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.lg, flexDirection: 'row',
      alignItems: 'center', justifyContent: 'space-between',
    },
    dateButtonText: { fontSize: FontSizes.lg, color: c.text },
  });
}

export default function EditOrderScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);

  const params = useLocalSearchParams<{
    orderId: string;
    customerName: string;
    description: string;
    quantity: string;
    date: string;
  }>();

  const [quantity, setQuantity]       = useState(params.quantity ?? '0');
  const [description, setDescription] = useState(params.description ?? '');
  const [orderDate, setOrderDate]     = useState<Date>(params.date ? new Date(params.date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving]           = useState(false);

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setOrderDate(date);
  };

  const handleSave = async () => {
    if (!description.trim()) { Alert.alert(tr.required, tr.enterDesc); return; }
    setSaving(true);
    try {
      const qty = parseInt(quantity, 10) || 0;
      await updateOrder(db, Number(params.orderId), description, qty, orderDate.toISOString());
      router.back();
    } catch {
      Alert.alert('Error', tr.couldNotSave);
    } finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={S.container} contentContainerStyle={S.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Customer (read-only) */}
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="person" size={16} color={colors.text} /> {tr.customers}</Text>
          <View style={S.readOnly}>
            <Text style={S.readOnlyText}>{params.customerName}</Text>
          </View>
        </View>

        {/* Date */}
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

        {/* Quantity */}
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="scale" size={16} color={colors.text} /> {tr.quantity}</Text>
          <TextInput style={S.input} value={quantity} onChangeText={t => setQuantity(t.replace(/[^0-9]/g, ''))} placeholder={tr.quantityPlaceholder} placeholderTextColor={colors.textMuted} keyboardType="number-pad" returnKeyType="next" />
        </View>

        {/* Description */}
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="notes" size={16} color={colors.text} /> {tr.description} *</Text>
          <TextInput style={[S.input, S.textArea]} value={description} onChangeText={setDescription} placeholder={tr.descPlaceholder} placeholderTextColor={colors.textMuted} multiline numberOfLines={4} textAlignVertical="top" />
        </View>

        <TouchableOpacity style={[S.saveButton, saving && S.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          <MaterialIcons name="save" size={24} color="#FFFFFF" />
          <Text style={S.saveButtonText}>{saving ? tr.saving : tr.saveChanges}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
