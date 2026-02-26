import { Linking, Alert } from 'react-native';
import { format } from 'date-fns';
import type { OrderWithCustomer } from '@/services/database';
import { translations, Lang } from '@/constants/translations';

export function formatInvoice(order: OrderWithCustomer, lang: Lang = 'en'): string {
  const tr = translations[lang];
  const dateStr    = format(new Date(order.date), 'dd MMM yyyy');
  const amountStr  = `\u20B9${order.amount.toFixed(2)}`;

  return (
    `*${tr.invoiceTitle}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.invoiceCustomer}:* ${order.customer_name}\n` +
    `*${tr.invoicePlace}:* ${order.customer_place}\n` +
    `*${tr.invoiceDate}:* ${dateStr}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.invoiceItem}:*\n${order.description}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.invoiceTotalAmount}: ${amountStr}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${tr.invoiceThanks}`
  );
}

export async function sendWhatsAppInvoice(
  order: OrderWithCustomer,
  lang: Lang = 'en',
): Promise<void> {
  const tr          = translations[lang];
  const phone       = order.customer_phone.replace(/\D/g, '');
  const text        = formatInvoice(order, lang);
  const encodedText = encodeURIComponent(text);
  const url         = `whatsapp://send?phone=${phone}&text=${encodedText}`;

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert(tr.whatsappNotFound, tr.whatsappNotInstalled, [{ text: 'OK' }]);
    }
  } catch {
    Alert.alert('Error', 'Could not open WhatsApp. Please try again.');
  }
}
