import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
  Customer, TransactionWithQuantity,
  deleteTransaction,
  getCustomerBalance, getCustomerBalanceForPeriod,
  getCustomerById, getTransactionsByCustomer, getTransactionsByCustomerForPeriod,
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { endOfDay, format, startOfDay, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text, TouchableOpacity,
  View,
} from 'react-native';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.card,
      padding: Spacing.xl,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    customerName: { fontSize: FontSizes.xxl, fontWeight: '700', color: c.text },
    customerSub:  { fontSize: FontSizes.md, color: c.textSecondary, marginTop: 4 },
    balanceCard: {
      margin: Spacing.md,
      padding: Spacing.xl,
      backgroundColor: c.card,
      borderRadius: Radius.lg,
      alignItems: 'center',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    balanceCardDue:     { borderLeftWidth: 4, borderLeftColor: c.danger },
    balanceCardSettled: { borderLeftWidth: 4, borderLeftColor: c.success },
    balanceCardCredit:  { borderLeftWidth: 4, borderLeftColor: c.primary },
    balanceLabel:  { fontSize: FontSizes.md, color: c.textSecondary, fontWeight: '600' },
    balanceAmount: { fontSize: FontSizes.xxxl, fontWeight: '800', marginTop: 4 },
    balanceDue:    { color: c.danger },
    balancePaid:   { color: c.success },
    balanceCredit: { color: c.primary },
    statusBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      marginTop: 6, paddingHorizontal: Spacing.md, paddingVertical: 4,
      borderRadius: 12,
    },
    statusBadgeDue:     { backgroundColor: c.dangerLight },
    statusBadgeSettled: { backgroundColor: c.successLight },
    statusBadgeCredit:  { backgroundColor: c.primaryLight },
    statusBadgeText:    { fontSize: FontSizes.sm, fontWeight: '600' },
    balanceRow: {
      flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: Spacing.md,
      paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: c.separator,
    },
    balanceDetail: { alignItems: 'center' },
    detailLabel:   { fontSize: FontSizes.sm, color: c.textMuted },
    detailValue:   { fontSize: FontSizes.lg, fontWeight: '700', color: c.text, marginTop: 2 },
    actions: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.md,
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
    },
    paymentBtn:   { backgroundColor: c.success },
    actionText:   { color: '#FFFFFF', fontSize: FontSizes.md, fontWeight: '700' },
    sectionTitle: {
      fontSize: FontSizes.lg, fontWeight: '700', color: c.text,
      paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    },
    listContent:  { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 32 },
    emptyOuter:   { flexGrow: 1 },
    txnCard: {
      backgroundColor: c.card,
      borderRadius: Radius.md,
      padding: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
    },
    txnIcon: {
      width: 40, height: 40, borderRadius: 20,
      justifyContent: 'center', alignItems: 'center',
    },
    txnDebitIcon:  { backgroundColor: c.dangerLight },
    txnCreditIcon: { backgroundColor: c.successLight },
    txnContent:    { flex: 1 },
    txnDesc:       { fontSize: FontSizes.md, fontWeight: '600', color: c.text },
    txnDate:       { fontSize: FontSizes.sm, color: c.textMuted, marginTop: 2 },
    txnAmount:     { fontSize: FontSizes.lg, fontWeight: '800' },
    txnDebit:      { color: c.danger },
    txnCredit:     { color: c.success },
    txnRunningBal: { fontSize: FontSizes.xs, color: c.textMuted, marginTop: 2 },
    emptyWrap:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
    emptyText:     { fontSize: FontSizes.lg, color: c.textSecondary, marginTop: Spacing.md },
    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      gap: Spacing.sm,
    },
    filterChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.md,
      backgroundColor: c.filterInactive ?? c.border,
      minWidth: 48,
      alignItems: 'center' as const,
    },
    filterChipActive: { backgroundColor: c.primary },
    filterChipText: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textSecondary },
    filterChipTextActive: { color: '#FFFFFF' },
  });
}

export default function CustomerDetailScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, tr, currencySymbol } = useSettings();
  const S = makeStyles(colors);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithQuantity[]>([]);
  const [balance, setBalance] = useState({ totalDebit: 0, totalCredit: 0, balance: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | 'week' | 'month' | 'year'>('all');

  const customerId = Number(id);

  const getDateRange = useCallback(() => {
    const now = new Date();
    const end = format(endOfDay(now), 'yyyy-MM-dd');
    switch (filterPeriod) {
      case 'today':  return { start: format(startOfDay(now), 'yyyy-MM-dd'), end };
      case 'week':   return { start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), end };
      case 'month':  return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end };
      case 'year':   return { start: format(startOfYear(now), 'yyyy-MM-dd'), end };
      default:       return null;
    }
  }, [filterPeriod]);

  const load = useCallback(async () => {
    const c = await getCustomerById(db, customerId);
    const range = getDateRange();
    const [txns, bal] = range
      ? await Promise.all([
          getTransactionsByCustomerForPeriod(db, customerId, range.start, range.end),
          getCustomerBalanceForPeriod(db, customerId, range.start, range.end),
        ])
      : await Promise.all([
          getTransactionsByCustomer(db, customerId),
          getCustomerBalance(db, customerId),
        ]);
    setCustomer(c);
    setTransactions(txns);
    setBalance(bal);
  }, [db, customerId, getDateRange]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => { load(); }, [filterPeriod]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleDeleteTransaction = (txn: TransactionWithQuantity) => {
    if (txn.type === 'debit') return; // Debit transactions are deleted via order deletion
    Alert.alert(tr.delete, `Delete this payment of ${currencySymbol}${txn.amount.toFixed(2)}?`, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          await deleteTransaction(db, txn.id);
          load();
        },
      },
    ]);
  };

  // Compute running balance for each transaction (oldest first, then reverse for display)
  const transactionsWithBalance = useMemo(() => {
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id,
    );
    let running = 0;
    const withBal = sorted.map(t => {
      running += t.type === 'debit' ? t.amount : -t.amount;
      return { ...t, runningBalance: running };
    });
    return withBal.reverse(); // newest first for display
  }, [transactions]);

  const renderTransaction = ({ item }: { item: TransactionWithQuantity & { runningBalance: number } }) => {
    const isDebit = item.type === 'debit';
    return (
      <TouchableOpacity
        style={S.txnCard}
        onLongPress={() => handleDeleteTransaction(item)}
        activeOpacity={0.7}
      >
        <View style={[S.txnIcon, isDebit ? S.txnDebitIcon : S.txnCreditIcon]}>
          <MaterialIcons
            name={isDebit ? 'shopping-bag' : 'payments'}
            size={20}
            color={isDebit ? colors.danger : colors.success}
          />
        </View>
        <View style={S.txnContent}>
          <Text style={S.txnDesc} numberOfLines={1}>
            {item.description}
            {isDebit && item.quantity > 0 ? ` · x${item.quantity}` : ''}
          </Text>
          <Text style={S.txnDate}>{format(new Date(item.date), 'dd MMM yyyy, hh:mm a')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[S.txnAmount, isDebit ? S.txnDebit : S.txnCredit]}>
            {isDebit ? '-' : '+'}{currencySymbol}{item.amount.toFixed(2)}
          </Text>
          <Text style={S.txnRunningBal}>{currencySymbol}{item.runningBalance.toFixed(2)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (!customer) return null;

  return (
    <View style={S.container}>
      <View style={S.header}>
        <Text style={S.customerName}>{customer.name}</Text>
        <Text style={S.customerSub}>
          <MaterialIcons name="location-on" size={14} color={colors.textSecondary} /> {customer.place}
          {'   '}
          <MaterialIcons name="phone" size={14} color={colors.textSecondary} /> {customer.phone_number}
        </Text>
      </View>

      <View style={[
        S.balanceCard,
        balance.balance > 0 ? S.balanceCardDue
          : balance.balance < 0 ? S.balanceCardCredit
          : S.balanceCardSettled,
      ]}>
        <Text style={S.balanceLabel}>
          {balance.balance > 0 ? tr.balanceDue : balance.balance < 0 ? tr.advanceCredit : tr.balanceDue}
        </Text>
        <Text style={[
          S.balanceAmount,
          balance.balance > 0 ? S.balanceDue
            : balance.balance < 0 ? S.balanceCredit
            : S.balancePaid,
        ]}>
          {balance.balance < 0 ? '+' : ''}{currencySymbol}{Math.abs(balance.balance).toFixed(2)}
        </Text>
        {/* Status badge */}
        {balance.balance > 0 && (
          <View style={[S.statusBadge, S.statusBadgeDue]}>
            <MaterialIcons name="warning" size={14} color={colors.danger} />
            <Text style={[S.statusBadgeText, { color: colors.danger }]}>{tr.due}</Text>
          </View>
        )}
        {balance.balance === 0 && (
          <View style={[S.statusBadge, S.statusBadgeSettled]}>
            <MaterialIcons name="check-circle" size={14} color={colors.success} />
            <Text style={[S.statusBadgeText, { color: colors.success }]}>{tr.allSettled}</Text>
          </View>
        )}
        {balance.balance < 0 && (
          <View style={[S.statusBadge, S.statusBadgeCredit]}>
            <MaterialIcons name="account-balance-wallet" size={14} color={colors.primary} />
            <Text style={[S.statusBadgeText, { color: colors.primary }]}>{tr.customerHasCredit}</Text>
          </View>
        )}
        <View style={S.balanceRow}>
          <View style={S.balanceDetail}>
            <Text style={S.detailLabel}>{tr.totalOrders}</Text>
            <Text style={S.detailValue}>{currencySymbol}{balance.totalDebit.toFixed(2)}</Text>
          </View>
          <View style={S.balanceDetail}>
            <Text style={S.detailLabel}>{tr.totalPaid}</Text>
            <Text style={S.detailValue}>{currencySymbol}{balance.totalCredit.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      <View style={S.actions}>
        <TouchableOpacity
          style={[S.actionBtn, S.paymentBtn]}
          onPress={() => router.push({ pathname: '/add-payment' as any, params: { customerId: String(customer.id), customerName: customer.name, customerPlace: customer.place } })}
        >
          <MaterialIcons name="payments" size={20} color="#FFFFFF" />
          <Text style={S.actionText}>{tr.recordPayment}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={S.filterRow}>
        {(['all', 'today', 'week', 'month', 'year'] as const).map(period => (
          <TouchableOpacity
            key={period}
            activeOpacity={0.7}
            style={[S.filterChip, filterPeriod === period && S.filterChipActive]}
            onPress={() => setFilterPeriod(period)}
          >
            <Text style={[S.filterChipText, filterPeriod === period && S.filterChipTextActive]}>
              {period === 'all' ? tr.all
                : period === 'today' ? tr.today
                : period === 'week' ? tr.thisWeek
                : period === 'month' ? tr.thisMonth
                : tr.thisYear}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={S.sectionTitle}>{tr.transactionHistory}</Text>

      <FlatList
        data={transactionsWithBalance}
        keyExtractor={item => String(item.id)}
        renderItem={renderTransaction}
        contentContainerStyle={transactions.length === 0 ? S.emptyOuter : S.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <View style={S.emptyWrap}>
            <MaterialIcons name="receipt-long" size={56} color={colors.textMuted} />
            <Text style={S.emptyText}>{tr.noTransactions}</Text>
          </View>
        }
      />
    </View>
  );
}
