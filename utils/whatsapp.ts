import { Lang, translations } from '@/constants/translations';
import type { OrderWithCustomer, Transaction } from '@/services/database';
import { format } from 'date-fns';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, Linking } from 'react-native';

export function formatInvoice(order: OrderWithCustomer, lang: Lang = 'en'): string {
  const tr = translations[lang];
  const dateStr    = format(new Date(order.date), 'dd MMM yyyy');
  const amountStr  = `\u20B9${order.amount.toFixed(2)}`;
  const qtyLine    = order.quantity > 0 ? `\n*${tr.quantity}:* ${order.quantity} pkt` : '';

  return (
    `*${tr.invoiceTitle}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.invoiceCustomer}:* ${order.customer_name}\n` +
    `*${tr.invoicePlace}:* ${order.customer_place}\n` +
    `*${tr.invoiceDate}:* ${dateStr}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.invoiceItem}:*\n${order.description}${qtyLine}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.invoiceTotalAmount}: ${amountStr}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${tr.invoiceThanks}`
  );
}

export function formatStatement(
  customer: { name: string; place: string },
  transactions: Transaction[],
  balance: { totalDebit: number; totalCredit: number; balance: number },
  lang: Lang = 'en',
): string {
  const tr = translations[lang];
  const dateStr = format(new Date(), 'dd MMM yyyy');

  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const historyLines = sorted.map(t => {
    const d = format(new Date(t.date), 'dd MMM');
    const icon = t.type === 'debit' ? '📦' : '💰';
    const amt = `\u20B9${t.amount.toFixed(2)}`;
    return `${icon} ${d} — ${t.description} — ${amt}`;
  }).join('\n');

  return (
    `*${tr.statementTitle}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.invoiceCustomer}:* ${customer.name}\n` +
    `*${tr.invoicePlace}:* ${customer.place}\n` +
    `*${tr.invoiceDate}:* ${dateStr}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.transactionHistory}:*\n\n` +
    `${historyLines}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${tr.totalOrders}: \u20B9${balance.totalDebit.toFixed(2)}\n` +
    `${tr.totalPaid}:   \u20B9${balance.totalCredit.toFixed(2)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.statementBalance}: \u20B9${balance.balance.toFixed(2)}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${tr.statementThanks}`
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

export async function sendWhatsAppStatement(
  phone: string,
  customer: { name: string; place: string },
  transactions: Transaction[],
  balance: { totalDebit: number; totalCredit: number; balance: number },
  lang: Lang = 'en',
): Promise<void> {
  const tr = translations[lang];
  const cleanPhone = phone.replace(/\D/g, '');
  const text = formatStatement(customer, transactions, balance, lang);
  const url = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;

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

/**
 * Share a statement image via the system share sheet (user picks WhatsApp).
 * @param imageUri - local file URI from ViewShot capture
 * @param customerName - used for the filename
 */
export async function shareStatementImage(
  imageUri: string,
  customerName: string,
  lang: Lang = 'en',
): Promise<void> {
  const tr = translations[lang];
  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert('Error', 'Sharing is not available on this device.');
      return;
    }

    // Copy captured image to a nicely-named file
    const safeName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
    const dateTag = format(new Date(), 'yyyyMMdd');
    const fileName = `MFC_Statement_${safeName}_${dateTag}.png`;

    const source = new File(imageUri);
    const dest = new File(Paths.cache, fileName);

    // Remove destination if it already exists, then copy
    try { dest.delete(); } catch { /* doesn't exist yet */ }
    source.copy(dest);

    await Sharing.shareAsync(dest.uri, {
      mimeType: 'image/png',
      dialogTitle: tr.shareStatement,
      UTI: 'public.png',
    });
  } catch (error) {
    console.error('Share statement error:', error);
    Alert.alert('Error', 'Could not share the statement image. Please try again.');
  }
}
