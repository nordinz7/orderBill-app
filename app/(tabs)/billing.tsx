import { getBulkPaymentDraftCount } from '@/app/bulk-payments';
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
  BillItem,
  billOrders,
  deleteTransaction,
  getAllTransactionsWithCustomer,
  getCustomerBalance,
  getCustomersWithOrders,
  getCustomersWithUnbilledOrders,
  getOrderIdsByBillId,
  getTransactionsByDateRange,
  getUnbilledOrders,
  getUnbilledOrdersByCustomer,
  getUnbilledOrdersByDate,
  OrderWithCustomer,
  TransactionWithCustomer,
  updateBilledAmount,
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DropdownItem { id: string; label: string }

type TabMode = 'unbilled' | 'billed' | 'payments' | null;

// ─── Styles ──────────────────────────────────────────────────────────────────

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    // Segmented control
    segmentRow: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
      gap: Spacing.sm,
      backgroundColor: c.card,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.filterInactive,
    },
    segmentBtnActive: {
      backgroundColor: c.primary,
    },
    segmentText: {
      fontSize: FontSizes.sm,
      fontWeight: '700',
      color: c.textSecondary,
    },
    segmentTextActive: {
      color: '#FFFFFF',
    },
    // Filters
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      gap: Spacing.sm,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      flexShrink: 0,
      paddingHorizontal: Spacing.sm, paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: c.filterInactive,
    },
    filterChipActive: { backgroundColor: c.primary },
    filterChipText: { fontSize: FontSizes.sm, fontWeight: '700', color: c.textSecondary },
    filterChipTextActive: { color: '#FFFFFF' },
    filterSpacer: { flex: 1 },
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
    // Section header (customer group)
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      gap: Spacing.sm,
      backgroundColor: c.background,
      marginTop: Spacing.sm,
    },
    sectionName: { fontSize: FontSizes.md, fontWeight: '700', color: c.text, flex: 1 },
    sectionPlace: { fontSize: FontSizes.sm, color: c.textSecondary },
    // Unbilled order row
    orderRow: {
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
    orderRowSelected: {
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    checkbox: {
      width: 24, height: 24, borderRadius: 6,
      borderWidth: 2, borderColor: c.border,
      justifyContent: 'center', alignItems: 'center',
    },
    checkboxChecked: {
      backgroundColor: c.primary, borderColor: c.primary,
    },
    orderInfo: { flex: 1 },
    orderRow1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
    orderDesc: { fontSize: FontSizes.md, fontWeight: '600', color: c.text, flex: 1 },
    orderQty: { fontSize: FontSizes.sm, fontWeight: '700', color: c.primary },
    orderDate: { fontSize: FontSizes.sm, color: c.textSecondary, marginTop: 1 },
    amountInput: {
      width: 80,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      fontSize: FontSizes.md,
      fontWeight: '700',
      color: c.text,
      textAlign: 'right',
      backgroundColor: c.inputBg,
    },
    amountInputActive: {
      borderColor: c.primary,
    },
    // Bottom bar
    bottomBar: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      backgroundColor: c.card,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: Spacing.sm,
    },
    billBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      backgroundColor: c.primary,
      paddingVertical: 14,
      borderRadius: Radius.md,
    },
    billBtnDisabled: {
      opacity: 0.4,
    },
    billBtnText: {
      fontSize: FontSizes.md,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    selectedSummary: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    selectedSummaryText: {
      fontSize: FontSizes.sm,
      color: c.textSecondary,
      fontWeight: '600',
    },
    selectedSummaryAmount: {
      fontSize: FontSizes.sm,
      color: c.primary,
      fontWeight: '800',
    },
    // History mode card
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
    customerName: { fontSize: FontSizes.md, fontWeight: '700', color: c.text, flex: 1 },
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
    badgeText: {
      color: '#FFFFFF', fontSize: 11, fontWeight: '800',
    },
    // Modal
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '60%', paddingBottom: 30,
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

export default function BillingScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr, defaultOrderDescription, currencySymbol } = useSettings();
  const insets = useSafeAreaInsets();
  const S = makeStyles(colors);

  const [mode, setMode] = useState<TabMode>('unbilled');
  const toggleMode = (m: TabMode) => setMode(prev => prev === m ? null : m);

  // ── Unbilled state ──
  const [unbilledOrders, setUnbilledOrders] = useState<OrderWithCustomer[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [unbilledDate, setUnbilledDate] = useState<Date | null>(null);
  const [showUnbilledDatePicker, setShowUnbilledDatePicker] = useState(false);
  const [unbilledCustomerId, setUnbilledCustomerId] = useState<string | null>(null);
  const [unbilledCustomerOptions, setUnbilledCustomerOptions] = useState<DropdownItem[]>([]);
  const [showUnbilledCustomerModal, setShowUnbilledCustomerModal] = useState(false);
  const [unbilledCustomerSearch, setUnbilledCustomerSearch] = useState('');
  const [billing, setBilling] = useState(false);

  // ── History state ──
  const [transactions, setTransactions] = useState<TransactionWithCustomer[]>([]);
  const [historyDate, setHistoryDate] = useState<Date | null>(new Date());
  const [showHistoryDatePicker, setShowHistoryDatePicker] = useState(false);
  const [historyCustomerId, setHistoryCustomerId] = useState<string | null>(null);
  const [historyCustomerOptions, setHistoryCustomerOptions] = useState<DropdownItem[]>([]);
  const [showHistoryCustomerModal, setShowHistoryCustomerModal] = useState(false);
  const [historyCustomerSearch, setHistoryCustomerSearch] = useState('');


  // ── Edit amount modal state ──
  const [editingTxn, setEditingTxn] = useState<TransactionWithCustomer | null>(null);
  const [editAmountValue, setEditAmountValue] = useState('');

  const [refreshing, setRefreshing] = useState(false);
  const [paymentDraftCount, setPaymentDraftCount] = useState(0);

  // ── Load data ──
  const loadUnbilled = useCallback(async () => {
    let results: OrderWithCustomer[];
    if (unbilledDate && unbilledCustomerId) {
      const dateStr = unbilledDate.toISOString().slice(0, 10);
      results = await getUnbilledOrdersByDate(db, dateStr, dateStr);
      results = results.filter(o => String(o.customer_id) === unbilledCustomerId);
    } else if (unbilledDate) {
      const dateStr = unbilledDate.toISOString().slice(0, 10);
      results = await getUnbilledOrdersByDate(db, dateStr, dateStr);
    } else if (unbilledCustomerId) {
      results = await getUnbilledOrdersByCustomer(db, Number(unbilledCustomerId));
    } else {
      results = await getUnbilledOrders(db);
    }
    setUnbilledOrders(results);
    const custs = await getCustomersWithUnbilledOrders(db);
    setUnbilledCustomerOptions(custs.map(c => ({ id: String(c.id), label: c.name })));
  }, [db, unbilledDate, unbilledCustomerId]);

  const loadHistory = useCallback(async () => {
    let results: TransactionWithCustomer[];
    if (historyDate) {
      const dateStr = historyDate.toISOString().slice(0, 10);
      results = await getTransactionsByDateRange(db, dateStr, dateStr);
    } else {
      results = await getAllTransactionsWithCustomer(db);
    }
    if (historyCustomerId) {
      results = results.filter(t => String(t.customer_id) === historyCustomerId);
    }
    setTransactions(results);
    const custs = await getCustomersWithOrders(db);
    setHistoryCustomerOptions(custs.map(c => ({ id: String(c.id), label: c.name })));
  }, [db, historyDate, historyCustomerId]);

  useFocusEffect(useCallback(() => {
    if (mode === 'unbilled') loadUnbilled();
    else loadHistory();
    getBulkPaymentDraftCount().then(setPaymentDraftCount);
  }, [mode, loadUnbilled, loadHistory]));

  // Also load history when switching from unbilled to null/billed/payments
  useEffect(() => {
    if (mode !== 'unbilled') loadHistory();
  }, [mode]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (mode === 'unbilled') await loadUnbilled();
    else await loadHistory();
    setRefreshing(false);
  };

  // ── Selection helpers ──
  const toggleSelect = (orderId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectCustomerGroup = (customerId: number) => {
    const groupOrders = unbilledOrders.filter(o => o.customer_id === customerId);
    const allSelected = groupOrders.every(o => selectedIds.has(o.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const o of groupOrders) {
        if (allSelected) next.delete(o.id);
        else next.add(o.id);
      }
      return next;
    });
  };

  const setAmount = (orderId: number, value: string) => {
    setAmounts(prev => ({ ...prev, [orderId]: value }));
  };

  // ── Billing action ──
  const selectedTotal = useMemo(() => {
    let total = 0;
    for (const id of selectedIds) {
      const amt = parseFloat(amounts[id] || '0');
      if (amt > 0) total += amt;
    }
    return total;
  }, [selectedIds, amounts]);

  const canBill = useMemo(() => {
    if (selectedIds.size === 0) return false;
    for (const id of selectedIds) {
      const amt = parseFloat(amounts[id] || '0');
      if (amt <= 0) return false;
    }
    return true;
  }, [selectedIds, amounts]);

  const handleGenerateBill = async () => {
    if (!canBill || billing) return;
    setBilling(true);
    try {
      // Group by customer
      const byCustomer = new Map<number, BillItem[]>();
      let lastBillId = 0;
      for (const id of selectedIds) {
        const order = unbilledOrders.find(o => o.id === id);
        if (!order) continue;
        const amount = parseFloat(amounts[id] || '0');
        if (!byCustomer.has(order.customer_id)) byCustomer.set(order.customer_id, []);
        byCustomer.get(order.customer_id)!.push({ orderId: id, amount });
      }

      for (const [customerId, items] of byCustomer) {
        const result = await billOrders(db, customerId, items);
        lastBillId = result.billId;
      }

      // Navigate for single-customer billing
      if (byCustomer.size === 1) {
        const customerId = byCustomer.keys().next().value!;
        const balance = await getCustomerBalance(db, customerId);
        // Check if there are prior transactions (balance from before this billing)
        const billedTotal = byCustomer.get(customerId)!.reduce((s, i) => s + i.amount, 0);
        const priorBalance = balance.balance - billedTotal;
        if (priorBalance !== 0) {
          // Customer has previous history — consolidated statement
          router.push({ pathname: '/view-statement', params: { id: String(customerId) } });
        } else {
          // No previous history — simple invoice for these orders
          const orderIds = byCustomer.get(customerId)!.map(i => i.orderId).join(',');
          router.push({ pathname: '/view-bill', params: { customerId: String(customerId), orderIds, billId: String(lastBillId) } });
        }
      } else {
        const totalCount = selectedIds.size;
        Alert.alert(tr.billGenerated, tr.billGeneratedMsg(totalCount));
      }

      // Reset state
      setSelectedIds(new Set());
      setAmounts({});
      await loadUnbilled();
    } catch {
      Alert.alert(tr.couldNotSave);
    } finally {
      setBilling(false);
    }
  };

  // ── Grouped unbilled data ──
  const groupedSections = useMemo(() => {
    const groups = new Map<number, { customer: { id: number; name: string; place: string }; orders: OrderWithCustomer[] }>();
    for (const order of unbilledOrders) {
      if (!groups.has(order.customer_id)) {
        groups.set(order.customer_id, {
          customer: { id: order.customer_id, name: order.customer_name, place: order.customer_place },
          orders: [],
        });
      }
      groups.get(order.customer_id)!.orders.push(order);
    }
    return Array.from(groups.values()).map(g => ({
      customer: g.customer,
      data: g.orders,
    }));
  }, [unbilledOrders]);

  // ── History helpers ──
  const handleDeleteTransaction = (txn: TransactionWithCustomer) => {
    if (txn.type === 'debit') return;
    Alert.alert(tr.delete, `${tr.delete} ${currencySymbol}${txn.amount} ${tr.payment.toLowerCase()} — ${txn.customer_name}?`, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          await deleteTransaction(db, txn.id);
          loadHistory();
        },
      },
    ]);
  };

  const displayedTransactions = useMemo(() => {
    if (mode === 'billed') return transactions.filter(t => t.type === 'debit');
    if (mode === 'payments') return transactions.filter(t => t.type === 'credit');
    return transactions;
  }, [transactions, mode]);
  const totalCredit = useMemo(() => displayedTransactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0), [displayedTransactions]);
  const totalDebit = useMemo(() => displayedTransactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0), [displayedTransactions]);

  // ── Date chip helpers ──
  const unbilledDateLabel = unbilledDate ? format(unbilledDate, 'dd MMM yyyy') : null;
  const historyDateLabel = historyDate ? format(historyDate, 'dd MMM yyyy') : null;

  const unbilledCustomerLabel = unbilledCustomerId
    ? unbilledCustomerOptions.find(c => c.id === unbilledCustomerId)?.label ?? null
    : null;
  const historyCustomerLabel = historyCustomerId
    ? historyCustomerOptions.find(c => c.id === historyCustomerId)?.label ?? null
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderUnbilledOrder = ({ item }: { item: OrderWithCustomer }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <View style={[S.orderRow, isSelected && S.orderRowSelected]}>
        <TouchableOpacity style={[S.checkbox, isSelected && S.checkboxChecked]} onPress={() => toggleSelect(item.id)}>
          {isSelected && <MaterialIcons name="check" size={16} color="#FFFFFF" />}
        </TouchableOpacity>
        <View style={S.orderInfo}>
          <View style={S.orderRow1}>
            <Text style={S.orderDesc} numberOfLines={1}>{item.description}</Text>
            {item.quantity > 0 && <Text style={S.orderQty}>x{item.quantity}</Text>}
          </View>
          <Text style={S.orderDate}>{format(new Date(item.date), 'dd MMM yyyy')}</Text>
        </View>
        {isSelected && (
          <TextInput
            style={[S.amountInput, amounts[item.id] ? S.amountInputActive : undefined]}
            value={amounts[item.id] || ''}
            onChangeText={(v) => setAmount(item.id, v)}
            placeholder={currencySymbol}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
        )}
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: { customer: { id: number; name: string; place: string }; data: OrderWithCustomer[] } }) => {
    const allSelected = section.data.every(o => selectedIds.has(o.id));
    return (
      <TouchableOpacity style={S.sectionHeader} onPress={() => toggleSelectCustomerGroup(section.customer.id)}>
        <View style={[S.checkbox, allSelected && S.checkboxChecked]}>
          {allSelected && <MaterialIcons name="check" size={16} color="#FFFFFF" />}
        </View>
        <Text style={S.sectionName} numberOfLines={1}>{section.customer.name}</Text>
        {section.customer.place ? <Text style={S.sectionPlace}>{section.customer.place}</Text> : null}
      </TouchableOpacity>
    );
  };

  const handleEditBilledAmount = (item: TransactionWithCustomer) => {
    setEditAmountValue(String(item.amount));
    setEditingTxn(item);
  };

  const handleSaveEditedAmount = async () => {
    if (!editingTxn) return;
    const newAmount = parseFloat(editAmountValue || '0');
    if (newAmount <= 0 || isNaN(newAmount)) {
      Alert.alert(tr.required, tr.invalidAmount);
      return;
    }
    await updateBilledAmount(db, editingTxn.id, newAmount);
    setEditingTxn(null);
    setEditAmountValue('');
    loadHistory();
  };

  const handleViewBill = async (item: TransactionWithCustomer) => {
    if (item.bill_id) {
      const orderIds = await getOrderIdsByBillId(db, item.bill_id);
      if (orderIds.length > 0) {
        router.push({ pathname: '/view-bill', params: { customerId: String(item.customer_id), orderIds: orderIds.join(','), billId: String(item.bill_id) } });
        return;
      }
    }
    router.push({ pathname: '/customer-detail', params: { id: String(item.customer_id) } });
  };

  const handleHistoryItemPress = (item: TransactionWithCustomer) => {
    if (item.type === 'credit') {
      router.push({ pathname: '/add-payment', params: { transactionId: String(item.id), customerId: String(item.customer_id) } });
      return;
    }
    // Debit (billed order) — confirm before editing
    Alert.alert(
      tr.editAmount,
      `${item.customer_name}${item.quantity > 0 ? ` · x${Math.round(item.quantity)}` : ''} · ${currencySymbol}${item.amount}`,
      [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.edit, onPress: () => handleEditBilledAmount(item) },
      ],
    );
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

  const renderHistoryItem = ({ item }: { item: TransactionWithCustomer }) => {
    const isCredit = item.type === 'credit';
    const isDebit = item.type === 'debit';
    return (
      <TouchableOpacity
        style={S.card}
        activeOpacity={0.7}
        onPress={() => handleHistoryItemPress(item)}
        onLongPress={() => isCredit && handleDeleteTransaction(item)}
      >
        <View style={S.cardContent}>
          <View style={S.cardRow1}>
            <Text style={S.customerName} numberOfLines={1}>{item.customer_name}</Text>
            <Text style={isCredit ? S.amountCredit : S.amountDebit}>
              {isCredit ? '+' : '-'}{currencySymbol}{item.amount}
            </Text>
          </View>
          <Text style={S.cardSub} numberOfLines={1}>
            {format(new Date(item.date), 'dd MMM')} · {isCredit ? tr.credit : tr.debit}
            {!isCredit && item.quantity > 0 ? ` · x${Math.round(item.quantity)}` : ''}
            {item.description && item.description !== defaultOrderDescription && item.description !== 'Payment received'
              ? ` · ${item.description}` : ''}
          </Text>
        </View>
        <View style={S.actionIcons}>
          {isDebit && (
            <TouchableOpacity
              style={S.actionIcon}
              onPress={() => handleInvoice(item)}
              hitSlop={8}
            >
              <MaterialIcons name="receipt" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
          {isCredit && (
            <TouchableOpacity
              style={S.actionIcon}
              onPress={() => handlePaymentReceipt(item)}
              hitSlop={8}
            >
              <MaterialIcons name="receipt" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={S.actionIcon}
            onPress={() => handleStatement(item)}
            hitSlop={8}
          >
            <MaterialIcons name="receipt-long" size={20} color={colors.success} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Customer modal (shared) ──
  const renderCustomerModal = (
    visible: boolean,
    onClose: () => void,
    search: string,
    setSearch: (v: string) => void,
    options: DropdownItem[],
    selectedId: string | null,
    onSelect: (id: string) => void,
  ) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={S.modalOverlay} onPress={onClose}>
        <Pressable style={S.modalContent} onPress={() => {}}>
          <View style={S.modalHeader}>
            <Text style={S.modalTitle}>{tr.filterByCustomer}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={S.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={S.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={tr.searchCustomers}
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <FlatList
            data={options.filter(c => !search.trim() || c.label.toLowerCase().includes(search.toLowerCase()))}
            keyExtractor={i => i.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[S.modalItem, item.id === selectedId && S.modalItemActive]}
                onPress={() => onSelect(item.id)}
              >
                <Text style={[S.modalItemText, item.id === selectedId && S.modalItemTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <View style={S.container}>
      {/* Segmented control */}
      <View style={S.segmentRow}>
        <TouchableOpacity
          style={[S.segmentBtn, mode === 'unbilled' && S.segmentBtnActive]}
          onPress={() => toggleMode('unbilled')}
        >
          <Text style={[S.segmentText, mode === 'unbilled' && S.segmentTextActive]}>{tr.unbilled}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.segmentBtn, mode === 'billed' && S.segmentBtnActive]}
          onPress={() => toggleMode('billed')}
        >
          <Text style={[S.segmentText, mode === 'billed' && S.segmentTextActive]}>{tr.billedTag}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.segmentBtn, mode === 'payments' && S.segmentBtnActive]}
          onPress={() => toggleMode('payments')}
        >
          <Text style={[S.segmentText, mode === 'payments' && S.segmentTextActive]}>{tr.paymentsOnly}</Text>
        </TouchableOpacity>
      </View>

      {/* ─── UNBILLED MODE ─── */}
      {mode === 'unbilled' && (
        <>
          <View style={S.filterRow}>
            <TouchableOpacity
              style={[S.filterChip, unbilledDate ? S.filterChipActive : undefined]}
              onPress={() => { if (unbilledDate) setUnbilledDate(null); else setShowUnbilledDatePicker(true); }}
            >
              <MaterialIcons name={unbilledDate ? 'close' : 'calendar-today'} size={16} color={unbilledDate ? '#FFFFFF' : colors.textSecondary} />
              <Text style={[S.filterChipText, unbilledDate && S.filterChipTextActive]}>
                {unbilledDateLabel ?? tr.selectDate}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.filterChip, unbilledCustomerId ? S.filterChipActive : undefined]}
              onPress={() => { if (unbilledCustomerId) setUnbilledCustomerId(null); else setShowUnbilledCustomerModal(true); }}
            >
              <MaterialIcons name={unbilledCustomerId ? 'close' : 'person'} size={16} color={unbilledCustomerId ? '#FFFFFF' : colors.textSecondary} />
              <Text style={[S.filterChipText, unbilledCustomerId && S.filterChipTextActive]}>
                {unbilledCustomerLabel ?? tr.selectCustomer}
              </Text>
            </TouchableOpacity>
          </View>

          {showUnbilledDatePicker && (
            <DateTimePicker
              value={unbilledDate ?? new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_e: DateTimePickerEvent, d?: Date) => {
                if (Platform.OS === 'android') setShowUnbilledDatePicker(false);
                if (d) setUnbilledDate(d);
              }}
            />
          )}

          {unbilledOrders.length > 0 && (
            <View style={S.summary}>
              <Text style={S.summaryText}>
                {unbilledOrders.length} {unbilledOrders.length === 1 ? tr.order : tr.orders_plural}
              </Text>
              <Text style={S.summaryText}>
                x{unbilledOrders.reduce((s, o) => s + (o.quantity || 0), 0)}
              </Text>
            </View>
          )}

          <SectionList
            sections={groupedSections}
            keyExtractor={item => String(item.id)}
            renderItem={renderUnbilledOrder}
            renderSectionHeader={renderSectionHeader}
            contentContainerStyle={unbilledOrders.length === 0 ? S.emptyOuter : S.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            stickySectionHeadersEnabled={false}
            ListEmptyComponent={
              <View style={S.emptyWrap}>
                <MaterialIcons name="receipt" size={72} color={colors.textMuted} />
                <Text style={S.emptyText}>{tr.nothingToBill}</Text>
                <Text style={S.emptySubText}>{tr.nothingToBillDesc}</Text>
              </View>
            }
          />

          {selectedIds.size > 0 ? (
            <View style={[S.bottomBar, { paddingBottom: Math.max(Spacing.md, insets.bottom) }]}>
              <View style={S.selectedSummary}>
                <Text style={S.selectedSummaryText}>{selectedIds.size} {tr.selected}</Text>
                {selectedTotal > 0 && <Text style={S.selectedSummaryAmount}>{currencySymbol}{selectedTotal}</Text>}
              </View>
              <TouchableOpacity
                style={[S.billBtn, !canBill && S.billBtnDisabled]}
                onPress={handleGenerateBill}
                disabled={!canBill || billing}
                activeOpacity={0.7}
              >
                <MaterialIcons name="receipt-long" size={22} color="#FFFFFF" />
                <Text style={S.billBtnText}>{tr.generateBill}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
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
            </>
          )}

          {renderCustomerModal(
            showUnbilledCustomerModal,
            () => { setShowUnbilledCustomerModal(false); setUnbilledCustomerSearch(''); },
            unbilledCustomerSearch,
            setUnbilledCustomerSearch,
            unbilledCustomerOptions,
            unbilledCustomerId,
            (id) => { setUnbilledCustomerId(id); setShowUnbilledCustomerModal(false); setUnbilledCustomerSearch(''); },
          )}
        </>
      )}

      {/* ─── HISTORY MODE ─── */}
      {(mode === 'billed' || mode === 'payments' || mode === null) && (
        <>
          <View style={S.filterRow}>
            <TouchableOpacity
              style={[S.filterChip, historyDate ? S.filterChipActive : undefined]}
              onPress={() => { if (historyDate) setHistoryDate(null); else setShowHistoryDatePicker(true); }}
            >
              <MaterialIcons name={historyDate ? 'close' : 'calendar-today'} size={14} color={historyDate ? '#FFFFFF' : colors.textSecondary} />
              <Text style={[S.filterChipText, historyDate && S.filterChipTextActive]}>
                {historyDateLabel ?? tr.date}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.filterChip, historyCustomerId ? S.filterChipActive : undefined]}
              onPress={() => { if (historyCustomerId) setHistoryCustomerId(null); else setShowHistoryCustomerModal(true); }}
            >
              <MaterialIcons name={historyCustomerId ? 'close' : 'person'} size={14} color={historyCustomerId ? '#FFFFFF' : colors.textSecondary} />
              <Text style={[S.filterChipText, historyCustomerId && S.filterChipTextActive]}>
                {historyCustomerLabel ?? tr.customer}
              </Text>
            </TouchableOpacity>
          </View>

          {showHistoryDatePicker && (
            <DateTimePicker
              value={historyDate ?? new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_e: DateTimePickerEvent, d?: Date) => {
                if (Platform.OS === 'android') setShowHistoryDatePicker(false);
                if (d) setHistoryDate(d);
              }}
            />
          )}

          {displayedTransactions.length > 0 && (
            <View style={S.summary}>
              <Text style={S.summaryText}>
                {displayedTransactions.length} {displayedTransactions.length === 1 ? tr.transaction : tr.transactions_plural}
              </Text>
              <View style={S.summaryRight}>
                {totalCredit > 0 && <Text style={S.summaryCredit}>+{currencySymbol}{totalCredit}</Text>}
                {totalDebit > 0 && <Text style={S.summaryDebit}>-{currencySymbol}{totalDebit}</Text>}
              </View>
            </View>
          )}

          <FlatList
            data={displayedTransactions}
            keyExtractor={item => String(item.id)}
            renderItem={renderHistoryItem}
            contentContainerStyle={displayedTransactions.length === 0 ? S.emptyOuter : S.listContent}
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

          {renderCustomerModal(
            showHistoryCustomerModal,
            () => { setShowHistoryCustomerModal(false); setHistoryCustomerSearch(''); },
            historyCustomerSearch,
            setHistoryCustomerSearch,
            historyCustomerOptions,
            historyCustomerId,
            (id) => { setHistoryCustomerId(id); setShowHistoryCustomerModal(false); setHistoryCustomerSearch(''); },
          )}
        </>
      )}

      {/* ─── EDIT AMOUNT MODAL ─── */}
      <Modal visible={!!editingTxn} transparent animationType="fade" onRequestClose={() => setEditingTxn(null)}>
        <Pressable style={S.modalOverlay} onPress={() => setEditingTxn(null)}>
          <Pressable style={S.modalContent} onPress={() => {}}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{tr.editAmount}</Text>
              <TouchableOpacity onPress={() => setEditingTxn(null)}>
                <Text style={S.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
              <Text style={{ fontSize: FontSizes.sm, color: colors.textSecondary }}>
                {editingTxn?.customer_name} — {editingTxn?.description}
              </Text>
              <TextInput
                style={[S.searchInput, { fontWeight: '700', fontSize: FontSizes.xl, textAlign: 'center', marginHorizontal: 0, marginTop: 0 }]}
                value={editAmountValue}
                onChangeText={setEditAmountValue}
                keyboardType="decimal-pad"
                placeholder={currencySymbol}
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <TouchableOpacity
                style={[S.billBtn, !editAmountValue && S.billBtnDisabled]}
                onPress={handleSaveEditedAmount}
                disabled={!editAmountValue}
                activeOpacity={0.7}
              >
                <MaterialIcons name="check" size={22} color="#FFFFFF" />
                <Text style={S.billBtnText}>{tr.save}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
