import StatementBill from '@/components/StatementBill';
import { AppColors, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { TransactionWithQuantity } from '@/services/database';
import { format, subDays } from 'date-fns';
import { ScrollView, StyleSheet, View } from 'react-native';

function getSampleTransactions(): TransactionWithQuantity[] {
  const today = new Date();
  return [
    { id: 1, customer_id: 1, order_id: 1, type: 'debit', amount: 500, description: 'Chicken Biriyani', quantity: 2, date: subDays(today, 5).toISOString(), created_date: '', updated_at: '' },
    { id: 2, customer_id: 1, order_id: 2, type: 'debit', amount: 300, description: 'Mutton Curry', quantity: 1, date: subDays(today, 3).toISOString(), created_date: '', updated_at: '' },
    { id: 3, customer_id: 1, order_id: null, type: 'credit', amount: 400, description: 'Cash Payment', quantity: 0, date: subDays(today, 1).toISOString(), created_date: '', updated_at: '' },
  ];
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scrollContent: {
      alignItems: 'center',
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.md,
      paddingBottom: 40,
    },
    billWrapper: {
      borderRadius: Radius.lg,
      overflow: 'hidden',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
  });
}

export default function PreviewStatementScreen() {
  const { colors, lang, companyName, companyPlace } = useSettings();
  const S = makeStyles(colors);
  const sampleTxns = getSampleTransactions();

  return (
    <ScrollView style={S.container} contentContainerStyle={S.scrollContent}>
      <View style={S.billWrapper}>
        <StatementBill
          companyName={companyName}
          companyPlace={companyPlace}
          customerName="Rahul Kumar"
          customerPlace="Chennai"
          date={format(new Date(), 'dd/MM/yyyy')}
          transactions={sampleTxns}
          totalOrders={800}
          totalPaid={400}
          balance={400}
          lang={lang}
        />
      </View>
    </ScrollView>
  );
}
