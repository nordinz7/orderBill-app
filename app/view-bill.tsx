import InvoiceBill from '@/components/InvoiceBill';
import { AppColors, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { getBillById, getCustomerById, type OrderWithCustomer } from '@/services/database';
import { shareInvoiceImage } from '@/utils/whatsapp';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
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
    billWrapper: {
      borderRadius: Radius.lg,
      overflow: 'hidden',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  });
}

export default function ViewBillScreen() {
  const db = useSQLiteContext();
  const { colors, tr, lang, companyName, companyPlace, companyPhone } = useSettings();
  const S = makeStyles(colors);

  const { customerId, orderIds, billId } = useLocalSearchParams<{
    customerId: string;
    orderIds: string; // comma-separated order IDs
    billId?: string;
  }>();

  const navigation = useNavigation();
  const billRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [billNumber, setBillNumber] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const handleShare = useCallback(async () => {
    if (sharing || !billRef.current?.capture) return;
    setSharing(true);
    try {
      const uri = await billRef.current.capture();
      await shareInvoiceImage(uri, orders[0]?.customer_name ?? '', lang);
    } catch (error) {
      console.error('Bill share error:', error);
    } finally {
      setSharing(false);
    }
  }, [sharing, orders, lang]);

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
      if (!customerId || !orderIds) return;
      const ids = orderIds.split(',').map(Number);
      const customer = await getCustomerById(db, Number(customerId));
      if (!customer) return;
      // Fetch each billed order
      const results: OrderWithCustomer[] = [];
      for (const id of ids) {
        const row = await db.getFirstAsync<OrderWithCustomer>(
          `SELECT o.*, COALESCE(t.amount, 0) AS billed_amount, c.name AS customer_name, c.place AS customer_place, c.phone_number AS customer_phone
           FROM orders o JOIN customers c ON o.customer_id = c.id
           LEFT JOIN transactions t ON t.order_id = o.id AND t.type = 'debit'
           WHERE o.id = ?`,
          [id]
        );
        if (row) results.push(row);
      }
      setOrders(results);

      // Fetch bill number
      const billIdNum = billId ? Number(billId) : results[0]?.bill_id;
      if (billIdNum) {
        const bill = await getBillById(db, billIdNum);
        if (bill) setBillNumber(bill.bill_number);
      }

      setLoading(false);
    })();
  }, [db, customerId, orderIds, billId]);

  if (loading) {
    return (
      <View style={[S.container, S.loading]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={S.container}>
      <ScrollView contentContainerStyle={S.scrollContent}>
        <View style={S.billWrapper}>
          <ViewShot ref={billRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
            <InvoiceBill
              companyName={companyName}
              companyPlace={companyPlace}
              companyPhone={companyPhone}
              billNumber={billNumber}
              orders={orders}
              lang={lang}
            />
          </ViewShot>
        </View>
      </ScrollView>
    </View>
  );
}
