import type { OrderWithCustomer } from '@/services/database';
import { format } from 'date-fns';
import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface InvoiceBillProps {
  companyName?: string;
  companyPlace?: string;
  order: OrderWithCustomer;
  lang?: 'en' | 'ta';
}

const LABELS = {
  en: {
    title: 'INVOICE / BILL',
    company: 'MFC FOOD PRODUCT',
    place: 'ADIRAMPATTINAM',
    to: 'To',
    date: 'Date',
    slNo: '#',
    item: 'Item / Description',
    qty: 'Qty',
    amount: 'Amount (₹)',
    totalAmount: 'Total Amount',
    thankYou: 'THANK YOU!',
    eoe: 'E. & O.E.',
  },
  ta: {
    title: 'விலைப்பட்டியல் / பில்',
    company: 'MFC FOOD PRODUCT',
    place: 'ADIRAMPATTINAM',
    to: 'பெறுநர்',
    date: 'தேதி',
    slNo: '#',
    item: 'பொருள் / விவரம்',
    qty: 'அளவு',
    amount: 'தொகை (₹)',
    totalAmount: 'மொத்த தொகை',
    thankYou: 'நன்றி!',
    eoe: 'E. & O.E.',
  },
};

const InvoiceBill = forwardRef<View, InvoiceBillProps>(
  ({ companyName, companyPlace, order, lang = 'en' }, ref) => {
    const L = LABELS[lang];
    const dateStr = format(new Date(order.date), 'dd/MM/yyyy');

    return (
      <View ref={ref} style={S.container} collapsable={false}>
        {/* ─── Header ────────────────────────────── */}
        <View style={S.headerBand}>
          <Text style={S.titleText}>{L.title}</Text>
        </View>

        <View style={S.companyBlock}>
          <Text style={S.companyName}>{companyName || L.company}</Text>
          <Text style={S.companyPlace}>{companyPlace || L.place}</Text>
        </View>

        {/* ─── Customer & Date ────────────────────── */}
        <View style={S.metaRow}>
          <View style={S.metaLeft}>
            <Text style={S.metaLabel}>
              {L.to}:{' '}
              <Text style={S.metaValue}>{order.customer_name}</Text>
            </Text>
            {order.customer_place ? (
              <Text style={S.metaLabelSmall}>{order.customer_place}</Text>
            ) : null}
          </View>
          <View style={S.metaRight}>
            <Text style={S.metaLabel}>
              {L.date}:{' '}
              <Text style={S.metaValue}>{dateStr}</Text>
            </Text>
          </View>
        </View>

        <View style={S.divider} />

        {/* ─── Table Header ──────────────────────── */}
        <View style={S.tableHeader}>
          <Text style={[S.thText, S.colNo]}>{L.slNo}</Text>
          <Text style={[S.thText, S.colDesc]}>{L.item}</Text>
          <Text style={[S.thText, S.colQty, { textAlign: 'center' }]}>{L.qty}</Text>
          <Text style={[S.thText, S.colAmt, { textAlign: 'right' }]}>{L.amount}</Text>
        </View>

        {/* ─── Table Row ─────────────────────────── */}
        <View style={[S.tableRow, S.rowEven]}>
          <Text style={[S.tdText, S.colNo]}>1</Text>
          <Text style={[S.tdText, S.colDesc]} numberOfLines={2}>
            {order.description}
          </Text>
          <Text style={[S.tdText, S.colQty, { textAlign: 'center' }]}>
            {order.quantity > 0 ? Math.round(order.quantity) : '-'}
          </Text>
          <Text style={[S.tdText, S.colAmt, { textAlign: 'right', fontWeight: '700' }]}>
            ₹{Math.round(order.amount)}
          </Text>
        </View>

        {/* Spacer for visual balance */}
        <View style={{ height: 12 }} />

        <View style={S.dividerThick} />

        {/* ─── Total ─────────────────────────────── */}
        <View style={S.totalBlock}>
          <Text style={S.totalLabel}>{L.totalAmount}</Text>
          <Text style={S.totalValue}>₹{Math.round(order.amount)}</Text>
        </View>

        <View style={S.dividerThick} />

        {/* ─── Footer ────────────────────────────── */}
        <View style={S.footer}>
          <Text style={S.thankYou}>{L.thankYou}</Text>
          <Text style={S.eoe}>{L.eoe}</Text>
        </View>
      </View>
    );
  },
);

InvoiceBill.displayName = 'InvoiceBill';
export default InvoiceBill;

// ─── Styles ─────────────────────────────────────────────────────────

const PINK = '#F8E8EC';
const PINK_DARK = '#D4687A';
const RED_BORDER = '#C62828';

const S = StyleSheet.create({
  container: {
    width: 380,
    backgroundColor: PINK,
    borderWidth: 2,
    borderColor: RED_BORDER,
    borderRadius: 6,
    padding: 14,
    overflow: 'hidden',
  },
  headerBand: {
    backgroundColor: RED_BORDER,
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metaLeft: { flex: 1 },
  metaRight: { alignItems: 'flex-end' },
  metaLabel: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 13,
    color: '#000',
    fontWeight: '800',
  },
  metaLabelSmall: {
    fontSize: 11,
    color: '#555',
    marginTop: 1,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: PINK_DARK,
    marginVertical: 6,
  },
  dividerThick: {
    borderBottomWidth: 2,
    borderBottomColor: RED_BORDER,
    marginVertical: 6,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: RED_BORDER,
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 6,
    marginBottom: 2,
  },
  thText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PINK_DARK,
    alignItems: 'center',
  },
  rowEven: { backgroundColor: 'rgba(255,255,255,0.35)' },
  tdText: {
    fontSize: 12,
    color: '#222',
    fontWeight: '500',
  },
  colNo: { width: 24 },
  colDesc: { flex: 1, paddingHorizontal: 4 },
  colQty: { width: 44 },
  colAmt: { width: 72 },
  totalBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  totalLabel: {
    fontSize: 15,
    color: '#000',
    fontWeight: '900',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#B71C1C',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 2,
  },
  thankYou: {
    fontSize: 14,
    fontWeight: '900',
    color: RED_BORDER,
    letterSpacing: 1,
  },
  eoe: {
    fontSize: 9,
    color: '#777',
    marginTop: 2,
  },
});
