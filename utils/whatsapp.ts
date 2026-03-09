import { Lang, translations } from '@/constants/translations';
import type { OrderWithCustomer, Transaction } from '@/services/database';
import { format } from 'date-fns';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, Linking } from 'react-native';

export function formatInvoice(order: OrderWithCustomer, lang: Lang = 'en', companyName: string = '', currencySymbol: string = '₹'): string {
  const tr = translations[lang];
  const dateStr    = format(new Date(order.date), 'dd MMM yyyy');
  const amountStr  = `${currencySymbol}${order.billed_amount.toFixed(2)}`;
  const qtyLine    = order.quantity > 0 ? `\n*${tr.quantity}:* x${order.quantity}` : '';

  return (
    `*${tr.invoiceTitle(companyName)}*\n` +
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
  companyName: string = '',
  currencySymbol: string = '₹',
): string {
  const tr = translations[lang];
  const dateStr = format(new Date(), 'dd MMM yyyy');

  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const historyLines = sorted.map(t => {
    const d = format(new Date(t.date), 'dd MMM');
    const icon = t.type === 'debit' ? '📦' : '💰';
    const amt = `${currencySymbol}${t.amount.toFixed(2)}`;
    return `${icon} ${d} — ${t.description} — ${amt}`;
  }).join('\n');

  return (
    `*${tr.statementTitle(companyName)}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.invoiceCustomer}:* ${customer.name}\n` +
    `*${tr.invoicePlace}:* ${customer.place}\n` +
    `*${tr.invoiceDate}:* ${dateStr}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.transactionHistory}:*\n\n` +
    `${historyLines}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${tr.totalOrders}: ${currencySymbol}${balance.totalDebit.toFixed(2)}\n` +
    `${tr.totalPaid}:   ${currencySymbol}${balance.totalCredit.toFixed(2)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${tr.statementBalance}: ${currencySymbol}${balance.balance.toFixed(2)}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${tr.statementThanks}`
  );
}

export async function sendWhatsAppInvoice(
  order: OrderWithCustomer,
  lang: Lang = 'en',
  companyName: string = '',
  currencySymbol: string = '₹',
): Promise<void> {
  const tr          = translations[lang];
  const phone       = order.customer_phone.replace(/\D/g, '');
  const text        = formatInvoice(order, lang, companyName, currencySymbol);
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
  companyName: string = '',
  currencySymbol: string = '₹',
): Promise<void> {
  const tr = translations[lang];
  const cleanPhone = phone.replace(/\D/g, '');
  const text = formatStatement(customer, transactions, balance, lang, companyName, currencySymbol);
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
 * Prepare image file: copy to cache with a nice filename, return the file URI.
 */
function prepareImageFile(imageUri: string, prefix: string, customerName: string): string {
  const safeName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
  const dateTag = format(new Date(), 'yyyyMMdd');
  const fileName = `${prefix}_${safeName}_${dateTag}.png`;

  const source = new File(imageUri);
  const dest = new File(Paths.cache, fileName);

  try { dest.delete(); } catch { /* doesn't exist yet */ }
  source.copy(dest);

  return dest.uri;
}

/**
 * Share an image via the Android/iOS share sheet.
 * The user picks WhatsApp (or any app) and the contact from there.
 */
async function shareImage(
  imageUri: string,
  dialogTitle: string,
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    Alert.alert('Error', 'Sharing is not available on this device.');
    return;
  }
  await Sharing.shareAsync(imageUri, {
    mimeType: 'image/png',
    dialogTitle,
    UTI: 'public.png',
  });
}

/**
 * Share an invoice image directly to WhatsApp.
 */
export async function shareInvoiceImage(
  imageUri: string,
  customerName: string,
  lang: Lang = 'en',
  companyName: string = '',
): Promise<void> {
  const tr = translations[lang];
  const prefix = companyName ? `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Invoice` : 'Invoice';
  try {
    const fileUri = prepareImageFile(imageUri, prefix, customerName);
    await shareImage(fileUri, tr.sendInvoice);
  } catch (error) {
    console.error('Share invoice error:', error);
    Alert.alert('Error', 'Could not share the invoice image. Please try again.');
  }
}

/**
 * Share a statement image via share sheet.
 */
export async function shareStatementImage(
  imageUri: string,
  customerName: string,
  lang: Lang = 'en',
  companyName: string = '',
): Promise<void> {
  const tr = translations[lang];
  const prefix = companyName ? `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Statement` : 'Statement';
  try {
    const fileUri = prepareImageFile(imageUri, prefix, customerName);
    await shareImage(fileUri, tr.shareStatement);
  } catch (error) {
    console.error('Share statement error:', error);
    Alert.alert('Error', 'Could not share the statement image. Please try again.');
  }
}

/**
 * Share a payment receipt image via share sheet.
 */
export async function sharePaymentReceiptImage(
  imageUri: string,
  customerName: string,
  lang: Lang = 'en',
  companyName: string = '',
): Promise<void> {
  const tr = translations[lang];
  const prefix = companyName ? `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Receipt` : 'Receipt';
  try {
    const fileUri = prepareImageFile(imageUri, prefix, customerName);
    await shareImage(fileUri, tr.sendPaymentReceipt);
  } catch (error) {
    console.error('Share payment receipt error:', error);
    Alert.alert('Error', 'Could not share the payment receipt. Please try again.');
  }
}
