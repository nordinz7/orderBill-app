import InvoiceBill from '@/components/InvoiceBill';
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import type { OrderWithCustomer } from '@/services/database';
import { shareInvoiceImage } from '@/utils/whatsapp';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
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
      bottom: 0,
      left: 0,
      right: 0,
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
  });
}

export default function ViewInvoiceScreen() {
  const { colors, tr, lang, companyName, companyPlace, companyPhone } = useSettings();
  const S = makeStyles(colors);
  const router = useRouter();

  const {
    customerName,
    customerPlace,
    customerPhone,
    amount,
    description,
    quantity,
    date,
  } = useLocalSearchParams<{
    customerName: string;
    customerPlace: string;
    customerPhone: string;
    amount: string;
    description: string;
    quantity: string;
    date: string;
  }>();

  const billRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  const order: OrderWithCustomer = {
    id: 0,
    customer_id: 0,
    customer_name: customerName ?? '',
    customer_place: customerPlace ?? '',
    customer_phone: customerPhone ?? '',
    billed_amount: parseFloat(amount ?? '0'),
    description: description ?? '',
    quantity: parseFloat(quantity ?? '0'),
    transaction_id: null,
    date: date ?? new Date().toISOString(),
    updated_at: '',
  };

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (billRef.current?.capture) {
        const uri = await billRef.current.capture();
        await shareInvoiceImage(uri, order.customer_name, lang);
      }
    } catch (error) {
      console.error('Invoice share error:', error);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={S.container}>
      <ScrollView contentContainerStyle={S.scrollContent}>
        <View style={S.billWrapper}>
          <ViewShot ref={billRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
            <InvoiceBill
              companyName={companyName}
              companyPlace={companyPlace}
              companyPhone={companyPhone}
              order={order}
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
