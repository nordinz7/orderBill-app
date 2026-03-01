import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
    Customer, Transaction,
    getCustomerBalance,
    getCustomerById, getTransactionsByCustomer,
    insertStatement, softDeleteTransaction,
} from '@/services/database';
import { sendWhatsAppStatement } from '@/utils/whatsapp';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
    Alert,
    FlatList,
    RefreshControl,
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
    balanceLabel:  { fontSize: FontSizes.md, color: c.textSecondary, fontWeight: '600' },
    balanceAmount: { fontSize: FontSizes.xxxl, fontWeight: '800', marginTop: 4 },
    balanceDue:    { color: c.danger },
    balancePaid:   { color: c.success },
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
    statementBtn: { backgroundColor: c.whatsapp },
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
    emptyWrap:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
    emptyText:     { fontSize: FontSizes.lg, color: c.textSecondary, marginTop: Spacing.md },
  });
}

export default function CustomerDetailScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, tr, lang } = useSettings();
  const S = makeStyles(colors);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState({ totalDebit: 0, totalCredit: 0, balance: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const customerId = Number(id);

  const load = useCallback(async () => {
    const [c, txns, bal] = await Promise.all([
      getCustomerById(db, customerId),
      getTransactionsByCustomer(db, customerId),
      getCustomerBalance(db, customerId),
    ]);
    setCustomer(c);
    setTransactions(txns);
    setBalance(bal);
  }, [db, customerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleSendStatement = async () => {
    if (!customer) return;
    if (transactions.length === 0) {
      Alert.alert('', tr.noBalanceDue);
      return;
    }
    try {
      // Save statement record
      const earliestDate = [...transactions].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      )[0]?.date ?? new Date().toISOString();

      await insertStatement(
        db, customerId, transactions.map(t => t.id),
        balance.totalDebit, balance.totalCredit, balance.balance,
        earliestDate,
      );
      // Send via WhatsApp
      await sendWhatsAppStatement(
        customer.phone_number, customer, transactions, balance, lang,
      );
    } catch {
      // Statement saved but WhatsApp might not open — that's OK
    }
  };

  const handleDeleteTransaction = (txn: Transaction) => {
    if (txn.type === 'debit') return; // Debit transactions are deleted via order deletion
    Alert.alert(tr.delete, `Delete this payment of \u20B9${txn.amount.toFixed(2)}?`, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          await softDeleteTransaction(db, txn.id);
          load();
        },
      },
    ]);
  };

  const renderTransaction = ({ item }: { item: Transaction }) => {
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
          <Text style={S.txnDesc} numberOfLines={1}>{item.description}</Text>
          <Text style={S.txnDate}>{format(new Date(item.date), 'dd MMM yyyy, hh:mm a')}</Text>
        </View>
        <Text style={[S.txnAmount, isDebit ? S.txnDebit : S.txnCredit]}>
          {isDebit ? '-' : '+'}₹{item.amount.toFixed(2)}
        </Text>
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

      <View style={S.balanceCard}>
        <Text style={S.balanceLabel}>{tr.balanceDue}</Text>
        <Text style={[S.balanceAmount, balance.balance > 0 ? S.balanceDue : S.balancePaid]}>
          ₹{Math.abs(balance.balance).toFixed(2)}
        </Text>
        {balance.balance <= 0 && (
          <Text style={{ color: colors.success, fontSize: FontSizes.sm, marginTop: 2 }}>{tr.paidInFull}</Text>
        )}
        <View style={S.balanceRow}>
          <View style={S.balanceDetail}>
            <Text style={S.detailLabel}>{tr.totalOrders}</Text>
            <Text style={S.detailValue}>₹{balance.totalDebit.toFixed(2)}</Text>
          </View>
          <View style={S.balanceDetail}>
            <Text style={S.detailLabel}>{tr.totalPaid}</Text>
            <Text style={S.detailValue}>₹{balance.totalCredit.toFixed(2)}</Text>
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
        <TouchableOpacity style={[S.actionBtn, S.statementBtn]} onPress={handleSendStatement}>
          <MaterialIcons name="send" size={20} color="#FFFFFF" />
          <Text style={S.actionText}>{tr.sendStatement}</Text>
        </TouchableOpacity>
      </View>

      <Text style={S.sectionTitle}>{tr.transactionHistory}</Text>

      <FlatList
        data={transactions}
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
