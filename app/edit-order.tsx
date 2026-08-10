import KeyboardScrollView from '@/components/KeyboardScrollView';
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
  getOrderWithCustomer,
  isLocked,
  OrderWithCustomer,
  setOrderLock,
  unitRate,
  updateOrder,
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
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
    row:            { flexDirection: 'row', gap: Spacing.md },
    halfField:      { gap: Spacing.xs, flex: 1 },
    label:          { fontSize: FontSizes.md, fontWeight: '700', color: c.text },
    input: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.lg, fontSize: FontSizes.lg, color: c.text,
    },
    textArea:       { minHeight: 100 },
    readOnly:       { backgroundColor: c.card, borderWidth: 1.5, borderColor: c.border, borderRadius: Radius.md, padding: Spacing.lg },
    readOnlyText:   { fontSize: FontSizes.lg, color: c.textSecondary },
    totalRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.primaryLight, borderRadius: Radius.md,
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    totalLabel:     { fontSize: FontSizes.md, fontWeight: '700', color: c.primary },
    totalValue:     { fontSize: FontSizes.xl, fontWeight: '800', color: c.primary },
    lockBanner: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: c.dangerLight, borderRadius: Radius.md,
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    lockText:       { flex: 1, fontSize: FontSizes.sm, fontWeight: '600', color: c.danger },
    unlockBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.danger, borderRadius: Radius.sm,
      paddingHorizontal: Spacing.md, paddingVertical: 6,
    },
    unlockBtnText:  { color: '#FFFFFF', fontSize: FontSizes.sm, fontWeight: '700' },
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
  const { colors, tr, currencySymbol } = useSettings();
  const S = makeStyles(colors);

  const params = useLocalSearchParams<{ orderId: string }>();
  const orderId = Number(params.orderId);

  const [order, setOrder] = useState<OrderWithCustomer | null>(null);
  const [quantity, setQuantity]       = useState('0');
  const [amount, setAmount]           = useState('0');
  const [description, setDescription] = useState('');
  const [orderDate, setOrderDate]     = useState<Date>(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving]           = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    const found = await getOrderWithCustomer(db, orderId);
    if (!found) { router.back(); return; }
    setOrder(found);
    setQuantity(String(found.quantity));
    setAmount(String(found.amount));
    setDescription(found.description);
    setOrderDate(new Date(found.date));
  }, [db, orderId, router]);

  useEffect(() => { void load(); }, [load]);

  const locked = order ? isLocked(order.date, order.locked) : false;

  const handleUnlock = () => {
    if (!order) return;
    Alert.alert(tr.unlockConfirm, tr.unlockConfirmMsg, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.unlock, onPress: async () => {
          await setOrderLock(db, order.id, false);
          await load();
        },
      },
    ]);
  };

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setOrderDate(date);
  };

  const qty = parseInt(quantity, 10) || 0;
  const total = parseFloat(amount) || 0;
  const perUnit = unitRate(total, qty);

  const handleSave = async () => {
    if (!description.trim()) { Alert.alert(tr.required, tr.enterDesc); return; }
    setSaving(true);
    try {
      await updateOrder(db, orderId, description, qty, total, orderDate.toISOString());
      router.back();
    } catch {
      Alert.alert(locked ? tr.locked : 'Error', locked ? tr.cannotEditLocked : tr.couldNotSave);
    } finally { setSaving(false); }
  };

  if (!order) return null;

  return (
    <KeyboardScrollView style={S.container} contentContainerStyle={S.scrollContent}>
        {locked && (
          <View style={S.lockBanner}>
            <MaterialIcons name="lock" size={20} color={colors.danger} />
            <Text style={S.lockText}>{tr.lockedNotice}</Text>
            <TouchableOpacity style={S.unlockBtn} onPress={handleUnlock}>
              <MaterialIcons name="lock-open" size={16} color="#FFFFFF" />
              <Text style={S.unlockBtnText}>{tr.unlock}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Customer (read-only) */}
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="person" size={16} color={colors.text} /> {tr.customers}</Text>
          <View style={S.readOnly}>
            <Text style={S.readOnlyText}>{order.customer_name} — {order.customer_place}</Text>
          </View>
        </View>

        {/* Date */}
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="event" size={16} color={colors.text} /> {tr.orderDate}</Text>
          <TouchableOpacity style={S.dateButton} onPress={() => setShowDatePicker(true)} disabled={locked}>
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

        {/* Quantity + rate */}
        <View style={S.row}>
          <View style={S.halfField}>
            <Text style={S.label}><MaterialIcons name="scale" size={16} color={colors.text} /> {tr.quantity}</Text>
            <TextInput
              style={S.input}
              value={quantity}
              onChangeText={t => setQuantity(t.replace(/[^0-9]/g, ''))}
              placeholder={tr.quantityPlaceholder}
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              returnKeyType="next"
              editable={!locked}
            />
          </View>
          <View style={S.halfField}>
            <Text style={S.label}><MaterialIcons name="payments" size={16} color={colors.text} /> {tr.amount}</Text>
            <TextInput
              style={S.input}
              value={amount}
              onChangeText={t => setAmount(t.replace(/[^0-9.]/g, ''))}
              placeholder={tr.amountPlaceholder}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              returnKeyType="next"
              editable={!locked}
            />
          </View>
        </View>

        {/* What the agreed amount works out to per unit — a read-out, not an
            input, so a price that was settled as a total stays exact. */}
        {perUnit > 0 && (
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>{tr.perUnitRate}</Text>
            <Text style={S.totalValue}>{currencySymbol}{perUnit}</Text>
          </View>
        )}

        {/* Description */}
        <View style={S.field}>
          <Text style={S.label}><MaterialIcons name="notes" size={16} color={colors.text} /> {tr.description} *</Text>
          <TextInput
            style={[S.input, S.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder={tr.descPlaceholder}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!locked}
          />
        </View>

        <TouchableOpacity
          style={[S.saveButton, (saving || locked) && S.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving || locked}
        >
          <MaterialIcons name="save" size={24} color="#FFFFFF" />
          <Text style={S.saveButtonText}>{saving ? tr.saving : tr.saveChanges}</Text>
        </TouchableOpacity>
    </KeyboardScrollView>
  );
}
