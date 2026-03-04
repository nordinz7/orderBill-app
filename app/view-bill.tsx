import InvoiceBill from '@/components/InvoiceBill';
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { getCustomerById, type OrderWithCustomer } from '@/services/database';
import { shareInvoiceImage } from '@/utils/whatsapp';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
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
      paddingBottom: 100,
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
    bottomBar: {
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      backgroundColor: c.card,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    shareBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.xs,
      backgroundColor: c.whatsapp,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
    },
    shareBtnText: {
      color: '#FFFFFF',
      fontSize: FontSizes.md,
      fontWeight: '700',
    },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  });
}

export default function ViewBillScreen() {
  const db = useSQLiteContext();
  const { colors, tr, lang, companyName, companyPlace, companyPhone } = useSettings();
  const S = makeStyles(colors);

  const { customerId, orderIds } = useLocalSearchParams<{
    customerId: string;
    orderIds: string; // comma-separated order IDs
  }>();

  const billRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    })();
  }, [db, customerId, orderIds]);

  const handleShare = async () => {
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
  };

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
              orders={orders}
              lang={lang}
            />
          </ViewShot>
        </View>
      </ScrollView>

      <View style={S.bottomBar}>
        <TouchableOpacity style={S.shareBtn} onPress={handleShare} disabled={sharing}>
          {sharing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialIcons name="share" size={20} color="#FFFFFF" />
              <Text style={S.shareBtnText}>{tr.sendInvoice}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
