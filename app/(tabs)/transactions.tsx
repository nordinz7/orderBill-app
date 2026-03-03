import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
    deleteTransaction,
    getAllTransactionsWithCustomer,
    getCustomersWithOrders,
    getTransactionsByDateRange,
    TransactionWithCustomer,
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface DropdownItem { id: string; label: string }

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: c.background },
    filterRow: {
      flexDirection: 'row',
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
      paddingHorizontal: Spacing.md, paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: c.filterInactive,
    },
    filterChipActive: { backgroundColor: c.primary },
    filterChipText: { fontSize: FontSizes.sm, fontWeight: '700', color: c.textSecondary },
    filterChipTextActive: { color: '#FFFFFF' },
    filterSpacer: { flex: 1 },
    summary: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: 6,
      backgroundColor: c.primaryLight,
    },
    summaryText:   { fontSize: FontSizes.sm, color: c.primary, fontWeight: '600' },
    summaryRight:  { flexDirection: 'row', gap: Spacing.md },
    summaryCredit: { fontSize: FontSizes.sm, color: c.success, fontWeight: '800' },
    summaryDebit:  { fontSize: FontSizes.sm, color: c.danger, fontWeight: '800' },
    listContent:   { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 100 },
    emptyOuter:    { flexGrow: 1 },
    card: {
      backgroundColor: c.card,
      borderRadius: Radius.md,
      padding: Spacing.sm,
      paddingHorizontal: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
    },
    dateBadge: {
      width: 48, height: 48, borderRadius: 24,
      justifyContent: 'center', alignItems: 'center',
    },
    dateBadgeCredit: { backgroundColor: c.successLight },
    dateBadgeDebit:  { backgroundColor: c.dangerLight },
    dateBadgeDay:    { fontSize: FontSizes.xl, fontWeight: '800', color: c.textSecondary, lineHeight: FontSizes.xl + 2 },
    dateBadgeMonth:  { fontSize: 10, fontWeight: '600', color: c.textMuted, marginTop: -2, textTransform: 'uppercase' },
    cardContent:  { flex: 1 },
    cardRow1:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    customerName: { fontSize: FontSizes.md, fontWeight: '700', color: c.text, flex: 1, marginRight: Spacing.sm },
    amountCredit: { fontSize: FontSizes.lg, fontWeight: '800', color: c.success },
    amountDebit:  { fontSize: FontSizes.lg, fontWeight: '800', color: c.danger },
    cardSub:      { fontSize: FontSizes.sm, color: c.textSecondary, marginTop: 2 },
    emptyWrap:    { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText:    { fontSize: FontSizes.xl, fontWeight: '600', color: c.textSecondary, marginTop: Spacing.lg },
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
    // Modal / dropdown styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: c.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '60%',
      paddingBottom: 30,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: {
      fontSize: FontSizes.lg,
      fontWeight: '700',
      color: c.text,
    },
    modalClose: {
      fontSize: FontSizes.lg,
      color: c.primary,
      fontWeight: '600',
    },
    modalItem: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    modalItemActive: {
      backgroundColor: c.primaryLight,
    },
    modalItemText: {
      fontSize: FontSizes.md,
      color: c.text,
    },
    modalItemTextActive: {
      color: c.primary,
      fontWeight: '700',
    },
    searchInput: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.md, fontSize: FontSizes.md, color: c.text,
      marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs,
    },
  });
}

export default function TransactionsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);

  const [transactions, setTransactions] = useState<TransactionWithCustomer[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Customer filter (AND — combined with date)
  const [customerOptions, setCustomerOptions] = useState<DropdownItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const loadDropdownData = useCallback(async () => {
    const customers = await getCustomersWithOrders(db);
    setCustomerOptions(customers.map(c => ({
      id: String(c.id),
      label: c.name,
    })));
  }, [db]);

  const load = useCallback(async () => {
    let results: TransactionWithCustomer[];
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().slice(0, 10);
      results = await getTransactionsByDateRange(db, dateStr, dateStr);
    } else {
      results = await getAllTransactionsWithCustomer(db);
    }
    if (selectedCustomerId) {
      results = results.filter(t => String(t.customer_id) === selectedCustomerId);
    }
    setTransactions(results);
  }, [db, selectedDate, selectedCustomerId]);

  useFocusEffect(useCallback(() => {
    loadDropdownData();
    load();
  }, [load, loadDropdownData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDropdownData();
    await load();
    setRefreshing(false);
  };

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  const dateChipLabel = selectedDate ? format(selectedDate, 'dd MMM yyyy') : null;

  // Customer is an AND filter alongside date
  const handleCustomerSelect = (custId: string) => {
    setSelectedCustomerId(custId);
    setShowCustomerModal(false);
    setCustomerSearch('');
  };

  const handleDeleteTransaction = (txn: TransactionWithCustomer) => {
    if (txn.type === 'debit') return; // don't delete order transactions directly
    Alert.alert(tr.delete, `${tr.delete} ₹${txn.amount} ${tr.payment.toLowerCase()} — ${txn.customer_name}?`, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          await deleteTransaction(db, txn.id);
          load();
        },
      },
    ]);
  };

  const displayed = transactions;

  const totalCredit = useMemo(() => displayed.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0), [displayed]);
  const totalDebit = useMemo(() => displayed.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0), [displayed]);

  const customerChipLabel = selectedCustomerId
    ? customerOptions.find(c => c.id === selectedCustomerId)?.label ?? null
    : null;

  const renderItem = ({ item }: { item: TransactionWithCustomer }) => {
    const isCredit = item.type === 'credit';
    return (
      <TouchableOpacity
        style={S.card}
        activeOpacity={0.7}
        onPress={() => router.push({ pathname: '/customer-detail', params: { id: String(item.customer_id) } })}
        onLongPress={() => isCredit && handleDeleteTransaction(item)}
      >
        <View style={[S.dateBadge, isCredit ? S.dateBadgeCredit : S.dateBadgeDebit]}>
          <Text style={S.dateBadgeDay}>{format(new Date(item.date), 'd')}</Text>
          <Text style={S.dateBadgeMonth}>{format(new Date(item.date), 'MMM')}</Text>
        </View>
        <View style={S.cardContent}>
          <View style={S.cardRow1}>
            <Text style={S.customerName} numberOfLines={1}>{item.customer_name}</Text>
            <Text style={isCredit ? S.amountCredit : S.amountDebit}>
              {isCredit ? '+' : '-'}&#8377;{item.amount}
            </Text>
          </View>
          <Text style={S.cardSub} numberOfLines={1}>
            {isCredit ? tr.credit : tr.debit} · {item.customer_place}
            {item.description && item.description !== 'Kuboos' && item.description !== 'Payment received'
              ? ` · ${item.description}` : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={S.container}>
      {/* Filter row: date chip + customer chip */}
      <View style={S.filterRow}>
        {/* Date filter chip */}
        <TouchableOpacity
          style={[S.filterChip, selectedDate ? S.filterChipActive : undefined]}
          onPress={() => {
            if (selectedDate) {
              setSelectedDate(null);
            } else {
              setShowDatePicker(true);
            }
          }}
        >
          <MaterialIcons
            name={selectedDate ? 'close' : 'calendar-today'}
            size={16}
            color={selectedDate ? '#FFFFFF' : colors.textSecondary}
          />
          {dateChipLabel ? (
            <Text style={[S.filterChipText, S.filterChipTextActive]} numberOfLines={1}>
              {dateChipLabel}
            </Text>
          ) : (
            <Text style={S.filterChipText}>{tr.selectDate}</Text>
          )}
        </TouchableOpacity>

        {/* Customer filter chip */}
        <TouchableOpacity
          style={[S.filterChip, selectedCustomerId ? S.filterChipActive : undefined]}
          onPress={() => {
            if (selectedCustomerId) {
              setSelectedCustomerId(null);
            } else {
              setShowCustomerModal(true);
            }
          }}
        >
          <MaterialIcons
            name={selectedCustomerId ? 'close' : 'person'}
            size={16}
            color={selectedCustomerId ? '#FFFFFF' : colors.textSecondary}
          />
          {customerChipLabel ? (
            <Text style={[S.filterChipText, S.filterChipTextActive]} numberOfLines={1}>
              {customerChipLabel}
            </Text>
          ) : (
            <Text style={S.filterChipText}>{tr.selectCustomer}</Text>
          )}
        </TouchableOpacity>

        <View style={S.filterSpacer} />
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onDateChange}
          themeVariant={colors.background === '#000000' || colors.background === '#121212' ? 'dark' : 'light'}
        />
      )}

      {displayed.length > 0 && (
        <View style={S.summary}>
          <Text style={S.summaryText}>
            {displayed.length} {displayed.length === 1 ? tr.transaction : tr.transactions_plural}
          </Text>
          <View style={S.summaryRight}>
            {totalCredit > 0 && <Text style={S.summaryCredit}>+&#8377;{totalCredit} {tr.totalReceived}</Text>}
            {totalDebit > 0 && <Text style={S.summaryDebit}>-&#8377;{totalDebit} {tr.totalOrdered}</Text>}
          </View>
        </View>
      )}

      <FlatList
        data={displayed}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={displayed.length === 0 ? S.emptyOuter : S.listContent}
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
        <MaterialIcons name="add" size={34} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Customer picker modal with search */}
      <Modal visible={showCustomerModal} transparent animationType="slide" onRequestClose={() => { setShowCustomerModal(false); setCustomerSearch(''); }}>
        <Pressable style={S.modalOverlay} onPress={() => { setShowCustomerModal(false); setCustomerSearch(''); }}>
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
              data={customerOptions.filter(c => {
                if (!customerSearch.trim()) return true;
                return c.label.toLowerCase().includes(customerSearch.toLowerCase());
              })}
              keyExtractor={i => i.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[S.modalItem, item.id === selectedCustomerId && S.modalItemActive]}
                  onPress={() => handleCustomerSelect(item.id)}
                >
                  <Text style={[
                    S.modalItemText,
                    item.id === selectedCustomerId && S.modalItemTextActive,
                  ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
