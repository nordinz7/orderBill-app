import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { bulkAddOrders, Customer, getActiveCustomers } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { addDays, format } from 'date-fns';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DRAFT_KEY = '@mfc_bulk_draft';

interface BulkDraft {
  quantities: Record<string, string>;
  description: string;
  orderDate: string;
}

async function loadDraft(): Promise<BulkDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveDraft(draft: BulkDraft): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function clearBulkDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}

/** Returns count of filled entries in draft (for badge). */
export async function getBulkDraftCount(): Promise<number> {
  const draft = await loadDraft();
  if (!draft) return 0;
  return Object.values(draft.quantities).filter(v => parseInt(v, 10) > 0).length;
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:     { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.card,
      padding: Spacing.lg,
      gap: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    field:         { gap: Spacing.xs, flex: 1 },
    label:         { fontSize: FontSizes.sm, fontWeight: '700', color: c.textSecondary },
    dateButton: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.md, flexDirection: 'row',
      alignItems: 'center', justifyContent: 'space-between',
    },
    dateButtonText: { fontSize: FontSizes.md, color: c.text, fontWeight: '600' },
    descInput: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.md, fontSize: FontSizes.md, color: c.text,
    },
    searchInput: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.md, fontSize: FontSizes.md, color: c.text,
    },
    listContent:   { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 140 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: Radius.md,
      padding: Spacing.md,
      gap: Spacing.md,
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
    },
    rowFilled: {
      borderWidth: 1.5,
      borderColor: c.primary,
      backgroundColor: c.primaryLight,
    },
    customerInfo:  { flex: 1 },
    customerName:  { fontSize: FontSizes.md, fontWeight: '700', color: c.text },
    customerPlace: { fontSize: FontSizes.sm, color: c.textSecondary, marginTop: 1 },
    qtyInput: {
      width: 70,
      backgroundColor: c.inputBg,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: Radius.md,
      padding: Spacing.sm,
      fontSize: FontSizes.xl,
      fontWeight: '800',
      color: c.primary,
      textAlign: 'center',
    },
    qtyInputFilled: {
      borderColor: c.primary,
      backgroundColor: c.card,
    },
    summary: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      backgroundColor: c.primaryLight,
    },
    summaryText:   { fontSize: FontSizes.sm, color: c.primary, fontWeight: '600' },
    footer: {
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      backgroundColor: c.card,
      padding: Spacing.lg,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: Spacing.sm,
    },
    footerRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    draftButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      backgroundColor: c.inputBg,
      borderWidth: 1.5,
      borderColor: c.border,
      padding: Spacing.lg,
      borderRadius: Radius.lg,
    },
    draftButtonText: { color: c.text, fontSize: FontSizes.md, fontWeight: '700' },
    clearButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      backgroundColor: c.dangerLight,
      borderWidth: 1.5,
      borderColor: c.danger,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.lg,
      borderRadius: Radius.lg,
    },
    finalizeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      backgroundColor: c.success,
      padding: Spacing.xl,
      borderRadius: Radius.lg,
    },
    finalizeDisabled: { opacity: 0.5 },
    finalizeText: { color: '#FFFFFF', fontSize: FontSizes.xl, fontWeight: '700' },
    emptyWrap:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText:     { fontSize: FontSizes.xl, fontWeight: '600', color: c.textSecondary, marginTop: Spacing.lg },
  });
}

interface CustomerRowProps {
  item: Customer;
  qty: string;
  onQtyChange: (id: number, value: string) => void;
  onSubmitEditing: () => void;
  inputRef: (ref: TextInput | null) => void;
  styles: ReturnType<typeof makeStyles>;
  textMutedColor: string;
}

const CustomerRow = React.memo(function CustomerRow({
  item,
  qty,
  onQtyChange,
  onSubmitEditing,
  inputRef,
  styles: S,
  textMutedColor,
}: CustomerRowProps) {
  const hasFill = parseInt(qty, 10) > 0;
  return (
    <View style={[S.row, hasFill && S.rowFilled]}>
      <View style={S.customerInfo}>
        <Text style={S.customerName}>{item.name}</Text>
        {item.place ? <Text style={S.customerPlace}>{item.place}</Text> : null}
      </View>
      <TextInput
        ref={inputRef}
        style={[S.qtyInput, hasFill && S.qtyInputFilled]}
        value={qty}
        onChangeText={v => onQtyChange(item.id, v.replace(/[^0-9]/g, ''))}
        placeholder="0"
        placeholderTextColor={textMutedColor}
        keyboardType="number-pad"
        returnKeyType="next"
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
});

export default function BulkOrdersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr, defaultOrderDescription } = useSettings();
  const insets = useSafeAreaInsets();
  const S = makeStyles(colors);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [description, setDescription] = useState(defaultOrderDescription);
  const [orderDate, setOrderDate] = useState<Date>(addDays(new Date(), 1));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const inputRefs = useRef<Record<number, TextInput | null>>({});

  // Load customers + restore draft
  useEffect(() => {
    (async () => {
      const [custs, draft] = await Promise.all([
        getActiveCustomers(db),
        loadDraft(),
      ]);
      setCustomers(custs);
      if (draft) {
        // Convert string keys back to number keys
        const restored: Record<number, string> = {};
        for (const [k, v] of Object.entries(draft.quantities)) {
          restored[parseInt(k, 10)] = v;
        }
        setQuantities(restored);
        setDescription(draft.description);
        setOrderDate(new Date(draft.orderDate));
      }
      setDraftLoaded(true);
    })();
  }, [db]);

  // Auto-save draft on every change (debounced via effect)
  const persistDraft = useCallback(() => {
    if (!draftLoaded) return;
    const stringKeys: Record<string, string> = {};
    for (const [k, v] of Object.entries(quantities)) {
      stringKeys[String(k)] = v;
    }
    saveDraft({
      quantities: stringKeys,
      description,
      orderDate: orderDate.toISOString(),
    });
  }, [quantities, description, orderDate, draftLoaded]);

  useEffect(() => { persistDraft(); }, [persistDraft]);

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setOrderDate(date);
  };

  const handleQtyChange = useCallback((customerId: number, value: string) => {
    setQuantities(prev => ({ ...prev, [customerId]: value }));
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      c => c.name.toLowerCase().includes(q) || c.place.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const filledCount = useMemo(
    () => Object.values(quantities).filter(v => parseInt(v, 10) > 0).length,
    [quantities]
  );

  const totalQty = useMemo(
    () => Object.values(quantities).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0),
    [quantities]
  );

  const handleSaveDraft = () => {
    persistDraft();
    Alert.alert(tr.draftSaved, tr.draftSavedMsg);
  };

  const handleClearDraft = () => {
    Alert.alert(tr.clearDraftConfirm, tr.clearDraftMsg, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          setQuantities({});
          setDescription(defaultOrderDescription);
          setOrderDate(addDays(new Date(), 1));
          await clearBulkDraft();
        },
      },
    ]);
  };

  const handleFinalize = () => {
    const entries = Object.entries(quantities)
      .map(([id, qty]) => ({ customer_id: parseInt(id, 10), quantity: parseInt(qty, 10) || 0 }))
      .filter(e => e.quantity > 0);

    if (entries.length === 0) {
      Alert.alert(tr.required, tr.noBulkOrders);
      return;
    }
    if (!description.trim()) {
      Alert.alert(tr.required, tr.enterDesc);
      return;
    }

    Alert.alert(tr.finalizeConfirm, tr.finalizeConfirmMsg(entries.length), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.finalize, onPress: async () => {
          setSaving(true);
          try {
            const count = await bulkAddOrders(db, entries, description, orderDate.toISOString());
            await clearBulkDraft();
            Alert.alert(tr.bulkOrdersSaved, tr.bulkOrdersSavedMsg(count), [
              { text: 'OK', onPress: () => router.replace({ pathname: '/(tabs)/orders', params: { filterDate: orderDate.toISOString().slice(0, 10) } }) },
            ]);
          } catch {
            Alert.alert('Error', tr.couldNotSave);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const renderItem = useCallback(({ item, index }: { item: Customer; index: number }) => {
    const qty = quantities[item.id] || '';
    return (
      <CustomerRow
        item={item}
        qty={qty}
        onQtyChange={handleQtyChange}
        onSubmitEditing={() => {
          const nextCustomer = filteredCustomers[index + 1];
          if (nextCustomer) {
            inputRefs.current[nextCustomer.id]?.focus();
          }
        }}
        inputRef={ref => { inputRefs.current[item.id] = ref; }}
        styles={S}
        textMutedColor={colors.textMuted}
      />
    );
  }, [quantities, filteredCustomers, handleQtyChange, S, colors.textMuted]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={S.container}>
        {/* Header: date + description + search */}
        <View style={S.header}>
          <View style={S.headerRow}>
            <View style={S.field}>
              <Text style={S.label}>{tr.orderDate}</Text>
              <TouchableOpacity style={S.dateButton} onPress={() => setShowDatePicker(true)}>
                <Text style={S.dateButtonText}>{format(orderDate, 'dd MMM yyyy, EEE')}</Text>
                <MaterialIcons name="calendar-today" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={[S.field, { maxWidth: 150 }]}>
              <Text style={S.label}>{tr.description}</Text>
              <TextInput
                style={S.descInput}
                value={description}
                onChangeText={setDescription}
                placeholder={tr.descPlaceholder}
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
          <TextInput
            style={S.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={tr.searchCustomers}
            placeholderTextColor={colors.textMuted}
          />
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

        {/* Summary bar */}
        {filledCount > 0 && (
          <View style={S.summary}>
            <Text style={S.summaryText}>
              {filledCount} {filledCount === 1 ? tr.order : tr.orders_plural}
            </Text>
            <Text style={S.summaryText}>
              {tr.total}: {totalQty} pcs
            </Text>
          </View>
        )}

        {/* Customer list with quantity inputs */}
        <FlatList
          data={filteredCustomers}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          extraData={quantities}
          contentContainerStyle={filteredCustomers.length === 0 ? { flexGrow: 1 } : S.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={S.emptyWrap}>
              <MaterialIcons name="people-outline" size={72} color={colors.textMuted} />
              <Text style={S.emptyText}>{tr.noCustomersYet}</Text>
            </View>
          }
        />

        {/* Footer: Draft + Clear + Finalize */}
        <View style={[S.footer, { paddingBottom: Math.max(Spacing.lg, insets.bottom + Spacing.sm) }]}>
          <View style={S.footerRow}>
            <TouchableOpacity style={S.draftButton} onPress={handleSaveDraft}>
              <MaterialIcons name="save" size={20} color={colors.text} />
              <Text style={S.draftButtonText}>{tr.saveDraft}</Text>
            </TouchableOpacity>
            {filledCount > 0 && (
              <TouchableOpacity style={S.clearButton} onPress={handleClearDraft}>
                <MaterialIcons name="delete-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[S.finalizeButton, (saving || filledCount === 0) && S.finalizeDisabled]}
            onPress={handleFinalize}
            disabled={saving || filledCount === 0}
          >
            <MaterialIcons name="check-circle" size={26} color="#FFFFFF" />
            <Text style={S.finalizeText}>
              {saving ? tr.saving : `${tr.finalize} (${filledCount})`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
