import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { bulkAddOrders, Customer, getActiveCustomers, localDayKey } from '@/services/database';
import { promptAddFirstCustomer } from '@/utils/customers';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { addDays, format } from 'date-fns';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import KeyboardFooter from '@/components/KeyboardFooter';
import KeyboardListView from '@/components/KeyboardListView';

const DRAFT_KEY = '@orderbill_bulk_draft';

/**
 * Which column the rows are filled in with. A batch is usually priced by the
 * unit, but not always — some days the figure that is actually agreed is the
 * amount, and working back to a rate to type it in is a step no one should
 * have to do in their head. Amount mode still asks for the quantity, so the
 * count is in front of the user while the figure is being decided.
 */
export type BulkMode = 'qty' | 'amount';

/** Which of a row's two boxes a keystroke belongs to. */
type BulkField = 'qty' | 'amount';

interface BulkDraft {
  quantities: Record<string, string>;
  /** Amounts typed directly, when the batch was entered in amount mode. */
  amounts?: Record<string, string>;
  /** Absent in drafts saved before the mode toggle existed — those were all quantities. */
  mode?: BulkMode;
  description: string;
  /** Per-unit rate the batch is priced at. Absent in drafts saved before rates. */
  rate?: string;
  orderDate: string;
}

/** A field is filled in if it parses to something above zero. */
const isFilled = (value: string) => (parseFloat(value) || 0) > 0;

/** Money, to the cent — a running total of floats otherwise shows its rounding. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Drafts round-trip through JSON, which turns the customer-id keys into strings. */
const toNumberKeys = (record: Record<string, string>): Record<number, string> =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [parseInt(k, 10), v]));
const toStringKeys = (record: Record<number, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [String(k), v]));

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
  const values = draft.mode === 'amount' ? draft.amounts ?? {} : draft.quantities;
  return Object.values(values).filter(isFilled).length;
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
    /** Amounts need room for cents, so the column is wider than the qty one. */
    amountInput: { width: 100, fontSize: FontSizes.lg },
    /** The quantity standing next to an amount is context, not the figure. */
    sideQtyInput: { width: 62, fontSize: FontSizes.lg, color: c.text },
    inputGroup:   { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
    inputColumn:  { alignItems: 'center', gap: 2 },
    inputCaption: { fontSize: FontSizes.xs, fontWeight: '700', color: c.textSecondary },
    // Mode toggle — two segments, only one of which is live at a time.
    modeRow: {
      flexDirection: 'row',
      backgroundColor: c.inputBg,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: Radius.md,
      padding: 3,
      gap: 3,
    },
    modeSegment: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      borderRadius: Radius.sm,
    },
    modeSegmentActive: { backgroundColor: c.primary },
    modeText:          { fontSize: FontSizes.sm, fontWeight: '700', color: c.textSecondary },
    modeTextActive:    { color: '#FFFFFF' },
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
  quantity: string;
  amount: string;
  mode: BulkMode;
  onValueChange: (id: number, field: BulkField, value: string) => void;
  onSubmitEditing: () => void;
  inputRef: (ref: TextInput | null) => void;
  styles: ReturnType<typeof makeStyles>;
  textMutedColor: string;
  qtyLabel: string;
  amountLabel: string;
}

const CustomerRow = React.memo(function CustomerRow({
  item,
  quantity,
  amount,
  mode,
  onValueChange,
  onSubmitEditing,
  inputRef,
  styles: S,
  textMutedColor,
  qtyLabel,
  amountLabel,
}: CustomerRowProps) {
  const isAmount = mode === 'amount';
  // Whichever column decides the order is the one that fills the row in: the
  // quantity beside an amount is only there to be read while typing it.
  const value = isAmount ? amount : quantity;
  const hasFill = isFilled(value);
  const mainRef = useRef<TextInput | null>(null);
  return (
    <View style={[S.row, hasFill && S.rowFilled]}>
      <View style={S.customerInfo}>
        <Text style={S.customerName}>{item.name}</Text>
        {item.place ? <Text style={S.customerPlace}>{item.place}</Text> : null}
      </View>
      <View style={S.inputGroup}>
        {isAmount && (
          <View style={S.inputColumn}>
            <Text style={S.inputCaption}>{qtyLabel}</Text>
            <TextInput
              style={[S.qtyInput, S.sideQtyInput, isFilled(quantity) && S.qtyInputFilled]}
              value={quantity}
              onChangeText={v => onValueChange(item.id, 'qty', v.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor={textMutedColor}
              keyboardType="number-pad"
              returnKeyType="next"
              onSubmitEditing={() => mainRef.current?.focus()}
            />
          </View>
        )}
        <View style={S.inputColumn}>
          {isAmount && <Text style={S.inputCaption}>{amountLabel}</Text>}
          <TextInput
            ref={ref => { mainRef.current = ref; inputRef(ref); }}
            style={[S.qtyInput, isAmount && S.amountInput, hasFill && S.qtyInputFilled]}
            value={value}
            onChangeText={v => onValueChange(item.id, isAmount ? 'amount' : 'qty', v.replace(isAmount ? /[^0-9.]/g : /[^0-9]/g, ''))}
            placeholder="0"
            placeholderTextColor={textMutedColor}
            keyboardType={isAmount ? 'decimal-pad' : 'number-pad'}
            returnKeyType="next"
            onSubmitEditing={onSubmitEditing}
          />
        </View>
      </View>
    </View>
  );
});

export default function BulkOrdersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr, defaultOrderDescription, currencySymbol } = useSettings();
  const S = makeStyles(colors);

  const [customers, setCustomers] = useState<Customer[]>([]);
  // The two columns are kept apart rather than reinterpreted, so flipping the
  // toggle to check the other way round never silently rewrites what was typed;
  // the quantities carry across both modes, only the amount is recomputed.
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [mode, setMode] = useState<BulkMode>('qty');
  const [description, setDescription] = useState(defaultOrderDescription);
  const [rate, setRate] = useState('');
  const [orderDate, setOrderDate] = useState<Date>(addDays(new Date(), 1));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [hasNoCustomers, setHasNoCustomers] = useState(false);
  const inputRefs = useRef<Record<number, TextInput | null>>({});

  // Load customers + restore draft
  useEffect(() => {
    (async () => {
      const [custs, draft] = await Promise.all([
        getActiveCustomers(db),
        loadDraft(),
      ]);
      setCustomers(custs);
      if (custs.length === 0) {
        setHasNoCustomers(true);
        promptAddFirstCustomer(tr, router);
        return;
      }
      if (draft) {
        setQuantities(toNumberKeys(draft.quantities));
        setAmounts(toNumberKeys(draft.amounts ?? {}));
        setMode(draft.mode ?? 'qty');
        setDescription(draft.description);
        setRate(draft.rate ?? '');
        setOrderDate(new Date(draft.orderDate));
      }
      setDraftLoaded(true);
    })();
  }, [db, router, tr]);

  // Auto-save draft on every change (debounced via effect)
  const persistDraft = useCallback(() => {
    if (!draftLoaded) return;
    saveDraft({
      quantities: toStringKeys(quantities),
      amounts: toStringKeys(amounts),
      mode,
      description,
      rate,
      orderDate: orderDate.toISOString(),
    });
  }, [quantities, amounts, mode, description, rate, orderDate, draftLoaded]);

  useEffect(() => { persistDraft(); }, [persistDraft]);

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setOrderDate(date);
  };

  const isAmountMode = mode === 'amount';

  const handleValueChange = useCallback((customerId: number, field: BulkField, value: string) => {
    const setter = field === 'amount' ? setAmounts : setQuantities;
    setter(prev => ({ ...prev, [customerId]: value }));
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      c => c.name.toLowerCase().includes(q) || c.place.toLowerCase().includes(q)
    );
  }, [customers, search]);

  /** The column currently being typed into — the other one is dormant. */
  const values = isAmountMode ? amounts : quantities;

  const filledCount = useMemo(
    () => Object.values(values).filter(isFilled).length,
    [values]
  );

  /** Both columns can change a row now, so the list watches both. */
  const listExtraData = useMemo(() => ({ quantities, amounts }), [quantities, amounts]);

  const perUnit = parseFloat(rate) || 0;

  // In qty mode the batch is priced by the unit and the amounts follow; in
  // amount mode the amount is what was agreed and the quantity rides along
  // with it. Either way the counts are worth totalling.
  const totalQty = useMemo(
    () => Object.values(quantities).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0),
    [quantities]
  );

  const totalValue = useMemo(
    () => round2(isAmountMode
      ? Object.values(amounts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
      : Object.values(quantities).reduce((sum, v) => sum + (parseInt(v, 10) || 0) * perUnit, 0)),
    [isAmountMode, amounts, quantities, perUnit]
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
          setAmounts({});
          setDescription(defaultOrderDescription);
          setRate('');
          setOrderDate(addDays(new Date(), 1));
          await clearBulkDraft();
        },
      },
    ]);
  };

  const handleFinalize = () => {
    // Whichever way the batch was typed, an order is stored as an amount — in
    // amount mode it keeps whatever quantity was typed beside it, and none if
    // that box was left empty.
    const entries = Object.entries(values)
      .map(([id, raw]) => {
        const customer_id = parseInt(id, 10);
        if (isAmountMode) {
          return {
            customer_id,
            quantity: parseInt(quantities[customer_id] ?? '', 10) || 0,
            amount: round2(parseFloat(raw) || 0),
          };
        }
        const quantity = parseInt(raw, 10) || 0;
        return { customer_id, quantity, amount: round2(quantity * perUnit) };
      })
      .filter(e => (isAmountMode ? e.amount > 0 : e.quantity > 0));

    if (entries.length === 0) {
      Alert.alert(tr.required, isAmountMode ? tr.noBulkAmounts : tr.noBulkOrders);
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
              { text: tr.ok, onPress: () => router.replace({ pathname: '/(tabs)/orders', params: { filterDate: localDayKey(orderDate) } }) },
            ]);
          } catch {
            Alert.alert(tr.error, tr.couldNotSave);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const renderItem = useCallback(({ item, index }: { item: Customer; index: number }) => {
    return (
      <CustomerRow
        item={item}
        quantity={quantities[item.id] || ''}
        amount={amounts[item.id] || ''}
        mode={mode}
        onValueChange={handleValueChange}
        onSubmitEditing={() => {
          const nextCustomer = filteredCustomers[index + 1];
          if (nextCustomer) {
            inputRefs.current[nextCustomer.id]?.focus();
          }
        }}
        inputRef={ref => { inputRefs.current[item.id] = ref; }}
        styles={S}
        textMutedColor={colors.textMuted}
        qtyLabel={tr.quantity}
        amountLabel={tr.amount}
      />
    );
  }, [quantities, amounts, mode, filteredCustomers, handleValueChange, S, colors.textMuted, tr]);

  if (hasNoCustomers) return null;

  return (
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
          <View style={[S.field, { maxWidth: 130 }]}>
            <Text style={S.label}>{tr.description}</Text>
            <TextInput
              style={S.descInput}
              value={description}
              onChangeText={setDescription}
              placeholder={tr.descPlaceholder}
              placeholderTextColor={colors.textMuted}
            />
          </View>
          {/* The shared rate is what prices a quantity, so it has nothing to
              say once the amounts are being typed in directly. */}
          {!isAmountMode && (
            <View style={[S.field, { maxWidth: 80 }]}>
              <Text style={S.label}>{tr.ratePerUnit}</Text>
              <TextInput
                style={S.descInput}
                value={rate}
                onChangeText={t => setRate(t.replace(/[^0-9.]/g, ''))}
                placeholder={tr.ratePlaceholder}
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>
          )}
        </View>
        <View style={S.modeRow}>
          {([['qty', tr.byQuantity], ['amount', tr.byAmount]] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[S.modeSegment, mode === key && S.modeSegmentActive]}
              onPress={() => setMode(key)}
              activeOpacity={0.7}
            >
              <Text style={[S.modeText, mode === key && S.modeTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
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
            {tr.total}: {totalQty > 0 ? `${totalQty}${totalValue > 0 ? ' · ' : ''}` : ''}
            {totalValue > 0 ? `${currencySymbol}${totalValue}` : ''}
          </Text>
        </View>
      )}

      {/* Customer list with quantity inputs */}
      <KeyboardListView
        data={filteredCustomers}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        extraData={listExtraData}
        contentContainerStyle={filteredCustomers.length === 0 ? { flexGrow: 1 } : S.listContent}
        ListEmptyComponent={
          <View style={S.emptyWrap}>
            <MaterialIcons name="people-outline" size={72} color={colors.textMuted} />
            <Text style={S.emptyText}>{tr.noCustomersYet}</Text>
          </View>
        }
      />

      {/* Footer: Draft + Clear + Finalize.
          The stack already pads the screen by the bottom safe-area inset, so
          adding it again here would double-count the navigation bar. */}
      <KeyboardFooter style={S.footer}>
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
      </KeyboardFooter>
    </View>
  );
}
