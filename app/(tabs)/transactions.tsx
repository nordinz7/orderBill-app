import { getBulkPaymentDraftCount } from '@/app/bulk-payments';
import KeyboardModal from '@/components/KeyboardModal';
import StatementExporter, { type StatementExporterHandle, type StatementTarget } from '@/components/StatementExporter';
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useListFilter } from '@/contexts/ListFilterContext';
import { useSettings } from '@/contexts/SettingsContext';
import {
    deleteTransaction,
    getAllTransactionsWithCustomer,
    getCustomersWithTransactions,
    getTransactionsByDateRange,
    isLocked,
    localDayKey,
    setTransactionLock,
    TransactionWithCustomer,
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Platform,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DropdownItem { id: string; label: string }

// ─── Styles ──────────────────────────────────────────────────────────────────

function makeStyles(c: AppColors, bottomInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    // Filters
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      gap: Spacing.sm,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      flexShrink: 0,
      paddingHorizontal: Spacing.md, paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: c.filterInactive,
    },
    filterChipActive: { backgroundColor: c.primary },
    filterChipText: { fontSize: FontSizes.sm, fontWeight: '700', color: c.textSecondary },
    filterChipTextActive: { color: '#FFFFFF' },
    filterSpacer: { flex: 1 },
    // Outlined so the export action reads as a verb, not another filter toggle.
    exportChip: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      flexShrink: 0,
      paddingHorizontal: Spacing.sm, paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1.5, borderColor: c.primary,
      backgroundColor: c.primaryLight,
    },
    exportChipDisabled: { opacity: 0.4 },
    exportChipText: { fontSize: FontSizes.sm, fontWeight: '700', color: c.primary },
    // Summary
    summary: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: 6,
      backgroundColor: c.primaryLight,
    },
    summaryText: { fontSize: FontSizes.sm, color: c.primary, fontWeight: '600' },
    summaryRight: { flexDirection: 'row', gap: Spacing.md },
    summaryCredit: { fontSize: FontSizes.sm, color: c.success, fontWeight: '800' },
    summaryDebit: { fontSize: FontSizes.sm, color: c.danger, fontWeight: '800' },
    // List
    listContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 100 },
    emptyOuter: { flexGrow: 1 },
    card: {
      backgroundColor: c.card,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
    },
    cardContent: { flex: 1 },
    cardRow1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
    nameWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
    customerName: { fontSize: FontSizes.md, fontWeight: '700', color: c.text, flexShrink: 1 },
    amountCredit: { fontSize: FontSizes.md, fontWeight: '800', color: c.success },
    amountDebit: { fontSize: FontSizes.md, fontWeight: '800', color: c.danger },
    cardSub: { fontSize: FontSizes.sm, color: c.textSecondary, marginTop: 1 },
    // Empty + FAB
    emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText: { fontSize: FontSizes.xl, fontWeight: '600', color: c.textSecondary, marginTop: Spacing.lg },
    emptySubText: { fontSize: FontSizes.md, color: c.textMuted, marginTop: Spacing.sm },
    fab: {
      position: 'absolute', bottom: 24, right: 24,
      width: 60, height: 60, borderRadius: 30,
      backgroundColor: c.primary,
      justifyContent: 'center', alignItems: 'center',
      elevation: 6,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35, shadowRadius: 8,
    },
    bulkFab: {
      position: 'absolute', bottom: 92, right: 28,
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: c.success,
      justifyContent: 'center', alignItems: 'center',
      elevation: 5,
      shadowColor: c.success,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3, shadowRadius: 6,
    },
    badge: {
      position: 'absolute', top: -4, right: -4,
      backgroundColor: c.danger,
      borderRadius: 10, minWidth: 20, height: 20,
      justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 4,
    },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalContent: {
      backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '60%', paddingBottom: bottomInset + Spacing.lg,
    },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    modalTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: c.text },
    modalClose: { fontSize: FontSizes.lg, color: c.primary, fontWeight: '600' },
    modalItem: {
      paddingHorizontal: Spacing.lg, paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
    },
    modalItemActive: { backgroundColor: c.primaryLight },
    modalItemText: { fontSize: FontSizes.md, color: c.text },
    modalItemTextActive: { color: c.primary, fontWeight: '700' },
    searchInput: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.md, fontSize: FontSizes.md, color: c.text,
      marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs,
    },
    actionIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginLeft: Spacing.xs,
    },
    actionIcon: {
      padding: 6,
      borderRadius: Radius.sm,
      backgroundColor: c.background,
    },
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * The ledger, as it stands: one row per order, payment received, or debt, with
 * a date and a customer to narrow it by. Nothing has to be "billed" first — an
 * order is on the books the moment it is entered.
 */
export default function TransactionsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr, defaultOrderDescription, currencySymbol } = useSettings();
  const insets = useSafeAreaInsets();
  const S = makeStyles(colors, insets.bottom);

  const [transactions, setTransactions] = useState<TransactionWithCustomer[]>([]);
  // Date and customer are shared with the Orders tab, so switching between the
  // two keeps looking at the same slice of the business.
  const {
    date: selectedDate, setDate: setSelectedDate,
    customer: selectedCustomer, setCustomer: setSelectedCustomer,
  } = useListFilter();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<DropdownItem[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [paymentDraftCount, setPaymentDraftCount] = useState(0);

  // ── Load data ──
  const load = useCallback(async () => {
    let results: TransactionWithCustomer[];
    if (selectedDate) {
      const dateStr = localDayKey(selectedDate);
      results = await getTransactionsByDateRange(db, dateStr, dateStr);
    } else {
      results = await getAllTransactionsWithCustomer(db);
    }
    if (selectedCustomer) {
      results = results.filter(t => String(t.customer_id) === selectedCustomer.id);
    }
    setTransactions(results);
  }, [db, selectedDate, selectedCustomer]);

  /** Who the ledger can be narrowed to — the same whichever day is showing. */
  const loadDropdownData = useCallback(async () => {
    const custs = await getCustomersWithTransactions(db);
    setCustomerOptions(custs.map(c => ({ id: String(c.id), label: c.name })));
  }, [db]);

  // Only the list follows the filters; the dropdown and the draft badge are
  // refreshed on arrival, so changing the date does not re-scan the ledger for
  // a list of names that has not changed.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useFocusEffect(useCallback(() => {
    void loadDropdownData();
    getBulkPaymentDraftCount().then(setPaymentDraftCount);
  }, [loadDropdownData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadDropdownData()]);
    setRefreshing(false);
  };

  const totalCredit = useMemo(
    () => transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
    [transactions],
  );
  const totalDebit = useMemo(
    () => transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
    [transactions],
  );

  // ── Statement export (driven by whatever filter is applied) ──
  const exporterRef = useRef<StatementExporterHandle>(null);

  /** Distinct customers in the list as currently filtered, in display order. */
  const exportTargets = useMemo<StatementTarget[]>(() => {
    const byId = new Map<number, StatementTarget>();
    for (const t of transactions) {
      if (!byId.has(t.customer_id)) {
        byId.set(t.customer_id, { id: t.customer_id, name: t.customer_name, place: t.customer_place });
      }
    }
    return Array.from(byId.values());
  }, [transactions]);

  const handleExportStatements = () => {
    const asOf = selectedDate ?? new Date();
    Alert.alert(
      tr.exportConfirm,
      tr.exportConfirmMsg(exportTargets.length, format(asOf, 'dd MMM yyyy')),
      [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.exportStatementImages, onPress: () => { void exporterRef.current?.run(exportTargets, asOf); } },
      ],
    );
  };

  // ── Row actions ──
  const handleToggleLock = async (item: TransactionWithCustomer) => {
    const locked = isLocked(item.date, item.locked);
    Alert.alert(
      locked ? tr.unlockConfirm : tr.lockConfirm,
      locked ? tr.unlockConfirmMsg : tr.lockConfirmMsg,
      [
        { text: tr.cancel, style: 'cancel' },
        {
          text: locked ? tr.unlock : tr.lock, onPress: async () => {
            await setTransactionLock(db, item.id, !locked);
            await load();
          },
        },
      ],
    );
  };

  const handleDelete = (item: TransactionWithCustomer) => {
    Alert.alert(
      tr.delete,
      `${tr.delete} ${currencySymbol}${item.amount} — ${item.customer_name}?`,
      [
        { text: tr.cancel, style: 'cancel' },
        {
          text: tr.delete, style: 'destructive', onPress: async () => {
            try {
              await deleteTransaction(db, item.id);
              await load();
            } catch {
              Alert.alert(tr.locked, tr.cannotEditLocked);
            }
          },
        },
      ],
    );
  };

  /** Long press is the way in to everything destructive or unusual. */
  const handleLongPress = (item: TransactionWithCustomer) => {
    const locked = isLocked(item.date, item.locked);
    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: locked ? tr.unlock : tr.lock, onPress: () => handleToggleLock(item) },
    ];
    // An order's ledger entry is removed by deleting the order itself, so the
    // two cannot fall out of step.
    if (!locked && item.order_id === null) {
      options.push({ text: tr.delete, style: 'destructive', onPress: () => handleDelete(item) });
    }
    options.push({ text: tr.cancel, style: 'cancel' });
    Alert.alert(item.customer_name, `${currencySymbol}${item.amount} · ${format(new Date(item.date), 'dd MMM yyyy')}`, options);
  };

  const handlePress = (item: TransactionWithCustomer) => {
    if (isLocked(item.date, item.locked)) {
      Alert.alert(tr.locked, tr.cannotEditLocked, [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.unlock, onPress: () => handleToggleLock(item) },
      ]);
      return;
    }
    // An order is edited as an order — quantity and rate live there.
    if (item.order_id !== null) {
      router.push({ pathname: '/edit-order', params: { orderId: String(item.order_id) } });
      return;
    }
    router.push({
      pathname: '/add-payment',
      params: { transactionId: String(item.id), customerId: String(item.customer_id) },
    });
  };

  const handleInvoice = (item: TransactionWithCustomer) => {
    router.push({
      pathname: '/view-invoice',
      params: {
        customerName: item.customer_name,
        customerPlace: item.customer_place,
        customerPhone: item.customer_phone,
        amount: String(item.amount),
        description: item.description,
        quantity: String(item.quantity ?? 0),
        date: item.date,
      },
    });
  };

  const handlePaymentReceipt = (item: TransactionWithCustomer) => {
    router.push({
      pathname: '/view-payment-receipt',
      params: {
        customerName: item.customer_name,
        customerPlace: item.customer_place,
        customerPhone: item.customer_phone,
        amount: String(item.amount),
        date: item.date,
        description: item.description,
      },
    });
  };

  const handleStatement = (item: TransactionWithCustomer) => {
    const endOfDay = item.date.slice(0, 10) + 'T23:59:59.999Z';
    router.push({
      pathname: '/view-statement',
      params: { id: String(item.customer_id), upToDate: endOfDay },
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: TransactionWithCustomer }) => {
    const isCredit = item.type === 'credit';
    const locked = isLocked(item.date, item.locked);
    // A debit with no order behind it is money owed, entered by hand.
    const kind = isCredit ? tr.credit : item.order_id !== null ? tr.debit : tr.debtTransaction;
    return (
      <TouchableOpacity
        style={S.card}
        activeOpacity={0.7}
        onPress={() => handlePress(item)}
        onLongPress={() => handleLongPress(item)}
      >
        <View style={S.cardContent}>
          <View style={S.cardRow1}>
            <View style={S.nameWrap}>
              <Text style={S.customerName} numberOfLines={1}>{item.customer_name}</Text>
              {locked && <MaterialIcons name="lock" size={14} color={colors.textMuted} />}
            </View>
            <Text style={isCredit ? S.amountCredit : S.amountDebit}>
              {isCredit ? '+' : '-'}{currencySymbol}{item.amount}
            </Text>
          </View>
          <Text style={S.cardSub} numberOfLines={1}>
            {format(new Date(item.date), 'dd MMM')} · {kind}
            {!isCredit && item.quantity > 0 ? ` · x${Math.round(item.quantity)}` : ''}
            {/* The default descriptions say nothing the row does not already
                say. Both languages are checked because entries keep whichever
                wording was in force when they were recorded. */}
            {item.description && item.description !== defaultOrderDescription
              && item.description !== 'Payment received' && item.description !== tr.paymentReceived
              ? ` · ${item.description}` : ''}
          </Text>
        </View>
        <View style={S.actionIcons}>
          <TouchableOpacity
            style={S.actionIcon}
            onPress={() => (isCredit ? handlePaymentReceipt(item) : handleInvoice(item))}
            hitSlop={8}
          >
            <MaterialIcons name="receipt" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={S.actionIcon} onPress={() => handleStatement(item)} hitSlop={8}>
            <MaterialIcons name="receipt-long" size={20} color={colors.success} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const dateChipLabel = selectedDate ? format(selectedDate, 'dd MMM yyyy') : null;
  const customerChipLabel = selectedCustomer?.name ?? null;

  return (
    <View style={S.container}>
      {/* Filter row: date chip + customer chip + export */}
      <View style={S.filterRow}>
        <TouchableOpacity
          style={[S.filterChip, selectedDate ? S.filterChipActive : undefined]}
          onPress={() => { if (selectedDate) setSelectedDate(null); else setShowDatePicker(true); }}
        >
          <MaterialIcons
            name={selectedDate ? 'close' : 'calendar-today'}
            size={16}
            color={selectedDate ? '#FFFFFF' : colors.textSecondary}
          />
          <Text style={[S.filterChipText, selectedDate && S.filterChipTextActive]} numberOfLines={1}>
            {dateChipLabel ?? tr.selectDate}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.filterChip, selectedCustomer ? S.filterChipActive : undefined]}
          onPress={() => { if (selectedCustomer) setSelectedCustomer(null); else setShowCustomerModal(true); }}
        >
          <MaterialIcons
            name={selectedCustomer ? 'close' : 'person'}
            size={16}
            color={selectedCustomer ? '#FFFFFF' : colors.textSecondary}
          />
          <Text style={[S.filterChipText, selectedCustomer && S.filterChipTextActive]} numberOfLines={1}>
            {customerChipLabel ?? tr.selectCustomer}
          </Text>
        </TouchableOpacity>

        <View style={S.filterSpacer} />

        {/* Exports statements for exactly the customers listed below,
            as of the applied date filter. */}
        <TouchableOpacity
          style={[S.exportChip, exportTargets.length === 0 && S.exportChipDisabled]}
          onPress={handleExportStatements}
          disabled={exportTargets.length === 0}
          accessibilityLabel={tr.exportStatementImages}
        >
          <MaterialIcons name="save-alt" size={14} color={colors.primary} />
          <Text style={S.exportChipText}>
            {exportTargets.length > 0 ? ` (${exportTargets.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_e: DateTimePickerEvent, d?: Date) => {
            if (Platform.OS === 'android') setShowDatePicker(false);
            if (d) setSelectedDate(d);
          }}
          themeVariant={colors.background === '#000000' || colors.background === '#121212' ? 'dark' : 'light'}
        />
      )}

      {transactions.length > 0 && (
        <View style={S.summary}>
          <Text style={S.summaryText}>
            {transactions.length} {transactions.length === 1 ? tr.transaction : tr.transactions_plural}
          </Text>
          <View style={S.summaryRight}>
            {totalCredit > 0 && <Text style={S.summaryCredit}>+{currencySymbol}{totalCredit}</Text>}
            {totalDebit > 0 && <Text style={S.summaryDebit}>-{currencySymbol}{totalDebit}</Text>}
          </View>
        </View>
      )}

      <FlatList
        data={transactions}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={transactions.length === 0 ? S.emptyOuter : S.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <View style={S.emptyWrap}>
            <MaterialIcons name="swap-horiz" size={72} color={colors.textMuted} />
            <Text style={S.emptyText}>{tr.noTransactionsFound}</Text>
            <Text style={S.emptySubText}>{tr.tapInfo}</Text>
          </View>
        }
      />

      <TouchableOpacity style={S.fab} onPress={() => router.push('/add-payment')} accessibilityLabel={tr.addPayment}>
        <MaterialIcons name="payments" size={28} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity style={S.bulkFab} onPress={() => router.push('/bulk-payments')} accessibilityLabel={tr.bulkPayments}>
        <MaterialIcons name="playlist-add" size={24} color="#FFFFFF" />
        {paymentDraftCount > 0 && (
          <View style={S.badge}>
            <Text style={S.badgeText}>{paymentDraftCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Customer picker modal with search */}
      <KeyboardModal
        visible={showCustomerModal}
        onRequestClose={() => { setShowCustomerModal(false); setCustomerSearch(''); }}
      >
        <Pressable
          style={S.modalOverlay}
          onPress={() => { setShowCustomerModal(false); setCustomerSearch(''); }}
        >
          <Pressable style={S.modalContent} onPress={() => {}}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{tr.filterByCustomer}</Text>
              <TouchableOpacity onPress={() => { setShowCustomerModal(false); setCustomerSearch(''); }}>
                <Text style={S.modalClose}>✕</Text>
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
            <FlatList
              data={customerOptions.filter(c => !customerSearch.trim() || c.label.toLowerCase().includes(customerSearch.toLowerCase()))}
              keyExtractor={i => i.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[S.modalItem, item.id === selectedCustomer?.id && S.modalItemActive]}
                  onPress={() => {
                    setSelectedCustomer({ id: item.id, name: item.label });
                    setShowCustomerModal(false);
                    setCustomerSearch('');
                  }}
                >
                  <Text style={[S.modalItemText, item.id === selectedCustomer?.id && S.modalItemTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </KeyboardModal>

      <StatementExporter ref={exporterRef} />
    </View>
  );
}
