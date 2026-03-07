import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { bulkInsertPayments, Customer, getActiveCustomers } from '@/services/database';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
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

const DRAFT_KEY = '@mfc_bulk_payment_draft';

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', icon: 'cash' as const },
  { key: 'gpay', label: 'GPay', icon: 'google' as const },
  { key: 'phonepe', label: 'PhonePe', icon: 'cellphone' as const },
  { key: 'paytm', label: 'Paytm', icon: 'wallet' as const },
  { key: 'upi', label: 'UPI', icon: 'bank-transfer' as const },
  { key: 'bank', label: 'Bank', icon: 'bank' as const },
];

interface BulkPaymentDraft {
  amounts: Record<string, string>;
  methods: Record<string, string>;
  paymentDate: string;
}

async function loadDraft(): Promise<BulkPaymentDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveDraft(draft: BulkPaymentDraft): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function clearBulkPaymentDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}

/** Returns count of filled entries in draft (for badge). */
export async function getBulkPaymentDraftCount(): Promise<number> {
  const draft = await loadDraft();
  if (!draft) return 0;
  return Object.values(draft.amounts).filter(v => parseFloat(v) > 0).length;
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
    searchInput: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.md, fontSize: FontSizes.md, color: c.text,
    },
    // Default method row in header
    methodRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    methodChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: Spacing.sm, paddingVertical: 6,
      borderRadius: 16, borderWidth: 1.5,
      borderColor: c.border, backgroundColor: c.inputBg,
    },
    methodChipActive: { borderColor: c.primary, backgroundColor: c.primaryLight },
    methodChipText: { fontSize: FontSizes.xs, fontWeight: '600', color: c.textSecondary },
    methodChipTextActive: { color: c.primary, fontWeight: '700' },
    listContent:   { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 140 },
    row: {
      backgroundColor: c.card,
      borderRadius: Radius.md,
      padding: Spacing.md,
      gap: Spacing.sm,
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
    },
    rowFilled: {
      borderWidth: 1.5,
      borderColor: c.success,
      backgroundColor: c.successLight,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    customerInfo:  { flex: 1 },
    customerName:  { fontSize: FontSizes.md, fontWeight: '700', color: c.text },
    customerPlace: { fontSize: FontSizes.sm, color: c.textSecondary, marginTop: 1 },
    amtInput: {
      width: 90,
      backgroundColor: c.inputBg,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: Radius.md,
      padding: Spacing.sm,
      fontSize: FontSizes.lg,
      fontWeight: '800',
      color: c.success,
      textAlign: 'center',
    },
    amtInputFilled: {
      borderColor: c.success,
      backgroundColor: c.card,
    },
    // Per-row method chips
    rowMethodRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      paddingLeft: 2,
    },
    rowMethodChip: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 12, borderWidth: 1,
      borderColor: c.border, backgroundColor: c.inputBg,
    },
    rowMethodChipActive: { borderColor: c.primary, backgroundColor: c.primaryLight },
    rowMethodText: { fontSize: 11, fontWeight: '600', color: c.textSecondary },
    rowMethodTextActive: { color: c.primary, fontWeight: '700' },
    summary: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      backgroundColor: c.successLight,
    },
    summaryText:   { fontSize: FontSizes.sm, color: c.success, fontWeight: '600' },
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
  amt: string;
  method: string;
  onAmtChange: (id: number, value: string) => void;
  onMethodChange: (id: number, method: string) => void;
  onSubmitEditing: () => void;
  inputRef: (ref: TextInput | null) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
}

const CustomerRow = React.memo(function CustomerRow({
  item,
  amt,
  method,
  onAmtChange,
  onMethodChange,
  onSubmitEditing,
  inputRef,
  styles: S,
  colors,
}: CustomerRowProps) {
  const hasFill = parseFloat(amt) > 0;
  return (
    <View style={[S.row, hasFill && S.rowFilled]}>
      <View style={S.rowTop}>
        <View style={S.customerInfo}>
          <Text style={S.customerName}>{item.name}</Text>
          {item.place ? <Text style={S.customerPlace}>{item.place}</Text> : null}
        </View>
        <TextInput
          ref={inputRef}
          style={[S.amtInput, hasFill && S.amtInputFilled]}
          value={amt}
          onChangeText={v => onAmtChange(item.id, v.replace(/[^0-9.]/g, ''))}
          placeholder="₹0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          returnKeyType="next"
          onSubmitEditing={onSubmitEditing}
        />
      </View>
      {hasFill && (
        <View style={S.rowMethodRow}>
          {PAYMENT_METHODS.map(m => {
            const active = method === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                style={[S.rowMethodChip, active && S.rowMethodChipActive]}
                onPress={() => onMethodChange(item.id, m.key)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={m.icon}
                  size={14}
                  color={active ? colors.primary : colors.textSecondary}
                />
                <Text style={[S.rowMethodText, active && S.rowMethodTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
});

export default function BulkPaymentsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr } = useSettings();
  const insets = useSafeAreaInsets();
  const S = makeStyles(colors);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [methods, setMethods] = useState<Record<number, string>>({});
  const [defaultMethod, setDefaultMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
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
        const restoredAmounts: Record<number, string> = {};
        for (const [k, v] of Object.entries(draft.amounts)) {
          restoredAmounts[parseInt(k, 10)] = v;
        }
        setAmounts(restoredAmounts);
        if (draft.methods) {
          const restoredMethods: Record<number, string> = {};
          for (const [k, v] of Object.entries(draft.methods)) {
            restoredMethods[parseInt(k, 10)] = v;
          }
          setMethods(restoredMethods);
        }
        setPaymentDate(new Date(draft.paymentDate));
      }
      setDraftLoaded(true);
    })();
  }, [db]);

  // Auto-save draft on every change
  const persistDraft = useCallback(() => {
    if (!draftLoaded) return;
    const stringAmounts: Record<string, string> = {};
    for (const [k, v] of Object.entries(amounts)) {
      stringAmounts[String(k)] = v;
    }
    const stringMethods: Record<string, string> = {};
    for (const [k, v] of Object.entries(methods)) {
      stringMethods[String(k)] = v;
    }
    saveDraft({
      amounts: stringAmounts,
      methods: stringMethods,
      paymentDate: paymentDate.toISOString(),
    });
  }, [amounts, methods, paymentDate, draftLoaded]);

  useEffect(() => { persistDraft(); }, [persistDraft]);

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setPaymentDate(date);
  };

  const handleAmtChange = useCallback((customerId: number, value: string) => {
    setAmounts(prev => ({ ...prev, [customerId]: value }));
  }, []);

  const handleMethodChange = useCallback((customerId: number, methodKey: string) => {
    setMethods(prev => {
      // Toggle: if already selected, unset (will use default)
      if (prev[customerId] === methodKey) {
        const next = { ...prev };
        delete next[customerId];
        return next;
      }
      return { ...prev, [customerId]: methodKey };
    });
  }, []);

  const getMethodForCustomer = useCallback((customerId: number): string => {
    return methods[customerId] || defaultMethod;
  }, [methods, defaultMethod]);

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      c => c.name.toLowerCase().includes(q) || c.place.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const filledCount = useMemo(
    () => Object.values(amounts).filter(v => parseFloat(v) > 0).length,
    [amounts]
  );

  const totalAmt = useMemo(
    () => Object.values(amounts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0),
    [amounts]
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
          setAmounts({});
          setMethods({});
          setDefaultMethod('cash');
          setPaymentDate(new Date());
          await clearBulkPaymentDraft();
        },
      },
    ]);
  };

  const handleFinalize = () => {
    const entries = Object.entries(amounts)
      .map(([id, amt]) => {
        const customerId = parseInt(id, 10);
        const methodKey = getMethodForCustomer(customerId);
        const methodLabel = PAYMENT_METHODS.find(m => m.key === methodKey)?.label || 'Cash';
        return { customer_id: customerId, amount: parseFloat(amt) || 0, description: methodLabel };
      })
      .filter(e => e.amount > 0);

    if (entries.length === 0) {
      Alert.alert(tr.required, tr.noBulkPayments);
      return;
    }

    Alert.alert(tr.finalizePaymentsConfirm, tr.finalizePaymentsConfirmMsg(entries.length), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.finalizePayments, onPress: async () => {
          setSaving(true);
          try {
            const count = await bulkInsertPayments(db, entries, paymentDate.toISOString());
            await clearBulkPaymentDraft();
            Alert.alert(tr.bulkPaymentsSaved, tr.bulkPaymentsSavedMsg(count), [
              { text: 'OK', onPress: () => router.back() },
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
    const amt = amounts[item.id] || '';
    const method = getMethodForCustomer(item.id);
    return (
      <CustomerRow
        item={item}
        amt={amt}
        method={method}
        onAmtChange={handleAmtChange}
        onMethodChange={handleMethodChange}
        onSubmitEditing={() => {
          const nextCustomer = filteredCustomers[index + 1];
          if (nextCustomer) {
            inputRefs.current[nextCustomer.id]?.focus();
          }
        }}
        inputRef={ref => { inputRefs.current[item.id] = ref; }}
        styles={S}
        colors={colors}
      />
    );
  }, [amounts, methods, filteredCustomers, handleAmtChange, handleMethodChange, getMethodForCustomer, S, colors]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={S.container}>
        {/* Header: date + default method + search */}
        <View style={S.header}>
          <View style={S.headerRow}>
            <View style={S.field}>
              <Text style={S.label}>{tr.paymentDate}</Text>
              <TouchableOpacity style={S.dateButton} onPress={() => setShowDatePicker(true)}>
                <Text style={S.dateButtonText}>{format(paymentDate, 'dd MMM yyyy, EEE')}</Text>
                <MaterialIcons name="calendar-today" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ gap: Spacing.xs }}>
            <Text style={S.label}>{tr.payment}</Text>
            <View style={S.methodRow}>
              {PAYMENT_METHODS.map(m => {
                const active = defaultMethod === m.key;
                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[S.methodChip, active && S.methodChipActive]}
                    onPress={() => setDefaultMethod(m.key)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={m.icon}
                      size={16}
                      color={active ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[S.methodChipText, active && S.methodChipTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
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
              value={paymentDate}
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
              {filledCount} {filledCount === 1 ? tr.payment_singular : tr.payments_plural}
            </Text>
            <Text style={S.summaryText}>
              {tr.total}: ₹{Math.round(totalAmt).toLocaleString()}
            </Text>
          </View>
        )}

        {/* Customer list with amount inputs + method chips */}
        <FlatList
          data={filteredCustomers}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          extraData={[amounts, methods, defaultMethod]}
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
              {saving ? tr.saving : `${tr.finalizePayments} (${filledCount})`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
