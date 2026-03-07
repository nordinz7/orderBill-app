import PaymentReceipt from '@/components/PaymentReceipt';
import { AppColors, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { sharePaymentReceiptImage } from '@/utils/whatsapp';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
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
  });
}

export default function ViewPaymentReceiptScreen() {
  const { colors, lang, companyName, companyPlace, companyPhone } = useSettings();
  const S = makeStyles(colors);

  const navigation = useNavigation();
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

  const handleShare = useCallback(async () => {
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
  }, [sharing, customerName, lang]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleShare} disabled={sharing} style={{ marginRight: Spacing.sm }}>
          {sharing ? (
            <ActivityIndicator size="small" color={colors.headerText} />
          ) : (
            <MaterialIcons name="share" size={24} color={colors.headerText} />
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleShare, sharing, colors]);

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
    </View>
  );
}
