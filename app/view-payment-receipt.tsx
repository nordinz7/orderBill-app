import PaymentReceipt from '@/components/PaymentReceipt';
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { sharePaymentReceiptImage } from '@/utils/whatsapp';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
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

export default function ViewPaymentReceiptScreen() {
  const { colors, tr, lang, companyName, companyPlace, companyPhone } = useSettings();
  const S = makeStyles(colors);

  const {
    customerName,
    customerPlace,
    customerPhone,
    amount,
    date,
    description,
  } = useLocalSearchParams<{
    customerName: string;
    customerPlace: string;
    customerPhone: string;
    amount: string;
    date: string;
    description: string;
  }>();

  const receiptRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (receiptRef.current?.capture) {
        const uri = await receiptRef.current.capture();
        await sharePaymentReceiptImage(uri, customerName ?? '', lang);
      }
    } catch (error) {
      console.error('Payment receipt share error:', error);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={S.container}>
      <ScrollView contentContainerStyle={S.scrollContent}>
        <View style={S.billWrapper}>
          <ViewShot ref={receiptRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
            <PaymentReceipt
              companyName={companyName}
              companyPlace={companyPlace}
              companyPhone={companyPhone}
              customerName={customerName ?? ''}
              customerPlace={customerPlace}
              amount={parseFloat(amount ?? '0')}
              date={date ?? new Date().toISOString()}
              description={description}
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
              <Text style={S.shareBtnText}>{tr.sendPaymentReceipt}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
