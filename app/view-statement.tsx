import StatementBill from '@/components/StatementBill';
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
    getCustomerBalance,
    getCustomerBalanceUpToDate,
    getCustomerById,
    getTransactionsByCustomer,
    getTransactionsByCustomerUpToDate,
    insertStatement,
    TransactionWithQuantity,
} from '@/services/database';
import { shareStatementImage } from '@/utils/whatsapp';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import ViewShot from 'react-native-view-shot';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scrollContent: {
      alignItems: 'center',
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.md,
    },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    billWrapper: {
      borderRadius: Radius.lg,
      overflow: 'hidden',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
    emptyText: { fontSize: FontSizes.lg, color: c.textSecondary, marginTop: Spacing.md, textAlign: 'center' },
  });
}

export default function ViewStatementScreen() {
  const db = useSQLiteContext();
  const { id, upToDate } = useLocalSearchParams<{ id: string; upToDate?: string }>();
  const { colors, tr, lang, companyName, companyPlace, companyPhone } = useSettings();
  const S = makeStyles(colors);

  const navigation = useNavigation();
  const billRef = useRef<ViewShot>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [customer, setCustomer] = useState<{ name: string; place: string; phone_number: string } | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithQuantity[]>([]);
  const [balance, setBalance] = useState({ totalDebit: 0, totalCredit: 0, balance: 0 });

  const customerId = Number(id);

  const handleShare = useCallback(async () => {
    if (!customer || sharing) return;
    setSharing(true);
    try {
      const earliestDate = [...transactions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )[0]?.date ?? new Date().toISOString();

      await insertStatement(
        db,
        customerId,
        transactions.map((t) => t.id),
        balance.totalDebit,
        balance.totalCredit,
        balance.balance,
        earliestDate,
      );

      if (billRef.current?.capture) {
        const uri = await billRef.current.capture();
        await shareStatementImage(uri, customer.name, lang);
      }
    } catch (error) {
      console.error('Statement share error:', error);
    } finally {
      setSharing(false);
    }
  }, [customer, sharing, transactions, balance, db, customerId, lang]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleShare} disabled={sharing || loading} style={{ marginRight: Spacing.sm }}>
          {sharing ? (
            <ActivityIndicator size="small" color={colors.headerText} />
          ) : (
            <MaterialIcons name="share" size={24} color={colors.headerText} />
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleShare, sharing, loading, colors]);

  useEffect(() => {
    (async () => {
      const c = await getCustomerById(db, customerId);
      const txns = upToDate
        ? await getTransactionsByCustomerUpToDate(db, customerId, upToDate)
        : await getTransactionsByCustomer(db, customerId);
      const bal = upToDate
        ? await getCustomerBalanceUpToDate(db, customerId, upToDate)
        : await getCustomerBalance(db, customerId);
      setCustomer(c);
      setTransactions(txns);
      setBalance(bal);
      setLoading(false);
    })();
  }, [db, customerId, upToDate]);

  if (loading) {
    return (
      <View style={S.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!customer || transactions.length === 0) {
    return (
      <View style={S.emptyWrap}>
        <MaterialIcons name="receipt-long" size={56} color={colors.textMuted} />
        <Text style={S.emptyText}>{tr.noBalanceDue}</Text>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <ScrollView contentContainerStyle={S.scrollContent}>
        <View style={S.billWrapper}>
          <ViewShot ref={billRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
            <StatementBill
              companyName={companyName}
              companyPlace={companyPlace}
              companyPhone={companyPhone}
              customerName={customer.name}
              customerPlace={customer.place}
              date={format(new Date(), 'dd/MM/yyyy')}
              transactions={transactions}
              totalOrders={balance.totalDebit}
              totalPaid={balance.totalCredit}
              balance={balance.balance}
              lang={lang}
            />
          </ViewShot>
        </View>
      </ScrollView>
    </View>
  );
}
