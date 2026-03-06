import { format } from 'date-fns';
import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface PaymentReceiptProps {
  companyName?: string;
  companyPlace?: string;
  companyPhone?: string;
  customerName: string;
  customerPlace?: string;
  amount: number;
  date: string;
  description?: string;
  lang?: 'en' | 'ta';
}

const LABELS = {
  en: {
    title: 'PAYMENT RECEIPT',
    company: 'MFC FOOD PRODUCT',
    place: 'ADIRAMPATTINAM',
    receivedFrom: 'Received From',
    date: 'Date',
    amount: 'Amount Received',
    description: 'Description',
    paymentReceived: 'Payment received',
    thankYou: 'THANK YOU!',
    eoe: 'E. & O.E.',
  },
  ta: {
    title: 'பணம் பெற்ற ரசீது',
    company: 'MFC FOOD PRODUCT',
    place: 'ADIRAMPATTINAM',
    receivedFrom: 'பெறப்பட்டவர்',
    date: 'தேதி',
    amount: 'பெற்ற தொகை',
    description: 'விவரம்',
    paymentReceived: 'பணம் பெறப்பட்டது',
    thankYou: 'நன்றி!',
    eoe: 'E. & O.E.',
  },
};

const PaymentReceipt = forwardRef<View, PaymentReceiptProps>(
  ({ companyName, companyPlace, companyPhone, customerName, customerPlace, amount, date, description, lang = 'en' }, ref) => {
    const L = LABELS[lang];
    const dateStr = format(new Date(date), 'dd/MM/yyyy');

    return (
      <View ref={ref} style={S.container} collapsable={false}>
        {/* Header */}
        <View style={S.headerBand}>
          <Text style={S.titleText}>{L.title}</Text>
        </View>

        <View style={S.companyBlock}>
          <Text style={S.companyName}>{companyName || L.company}</Text>
          <Text style={S.companyPlace}>{companyPlace || L.place}</Text>
          {companyPhone ? <Text style={S.companyPhone}>{companyPhone}</Text> : null}
        </View>

        <View style={S.divider} />

        {/* Details */}
        <View style={S.detailRow}>
          <Text style={S.detailLabel}>{L.receivedFrom}</Text>
          <Text style={S.detailValue}>{customerName}</Text>
        </View>
        {customerPlace ? (
          <View style={S.detailRow}>
            <Text style={S.detailLabel} />
            <Text style={S.detailSubValue}>{customerPlace}</Text>
          </View>
        ) : null}
        <View style={S.detailRow}>
          <Text style={S.detailLabel}>{L.date}</Text>
          <Text style={S.detailValue}>{dateStr}</Text>
        </View>
        {description && description !== 'Payment received' && description !== L.paymentReceived ? (
          <View style={S.detailRow}>
            <Text style={S.detailLabel}>{L.description}</Text>
            <Text style={S.detailValue}>{description}</Text>
          </View>
        ) : null}

        <View style={S.dividerThick} />

        {/* Amount */}
        <View style={S.amountBlock}>
          <Text style={S.amountLabel}>{L.amount}</Text>
          <Text style={S.amountValue}>{Math.round(amount)}</Text>
        </View>

        <View style={S.dividerThick} />

        {/* Footer */}
        <View style={S.footer}>
          <Text style={S.thankYou}>{L.thankYou}</Text>
          <Text style={S.eoe}>{L.eoe}</Text>
        </View>
      </View>
    );
  },
);

PaymentReceipt.displayName = 'PaymentReceipt';
export default PaymentReceipt;

// Styles
const GREEN = '#E8F5E9';
const GREEN_DARK = '#388E3C';
const GREEN_BORDER = '#2E7D32';

const S = StyleSheet.create({
  container: {
    width: 380,
    backgroundColor: GREEN,
    borderWidth: 2,
    borderColor: GREEN_BORDER,
    borderRadius: 6,
    padding: 14,
    overflow: 'hidden',
  },
  headerBand: {
    backgroundColor: GREEN_BORDER,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'center',
    marginBottom: 8,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
  },
  companyBlock: {
    alignItems: 'center',
    marginBottom: 10,
  },
  companyName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1A237E',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  companyPlace: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A237E',
    textAlign: 'center',
  },
  companyPhone: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginTop: 2,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: GREEN_DARK,
    marginVertical: 6,
  },
  dividerThick: {
    borderBottomWidth: 2,
    borderBottomColor: GREEN_BORDER,
    marginVertical: 6,
  },
  detailRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  detailLabel: {
    width: 120,
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
  },
  detailSubValue: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
  },
  amountBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  amountLabel: {
    fontSize: 15,
    color: '#000',
    fontWeight: '900',
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '900',
    color: GREEN_BORDER,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 2,
  },
  thankYou: {
    fontSize: 14,
    fontWeight: '900',
    color: GREEN_BORDER,
    letterSpacing: 1,
  },
  eoe: {
    fontSize: 9,
    color: '#777',
    marginTop: 2,
  },
});
