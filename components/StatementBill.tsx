import { TransactionWithQuantity } from '@/services/database';
import { format } from 'date-fns';
import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface StatementBillProps {
  companyName?: string;
  companyPlace?: string;
  companyPhone?: string;
  customerName: string;
  customerPlace: string;
  date: string;
  transactions: TransactionWithQuantity[];
  totalOrders: number;
  totalPaid: number;
  balance: number;
  lang?: 'en' | 'ta';
}

const LABELS = {
  en: {
    title: 'STATEMENT',
    to: 'To',
    date: 'Date',
    dateCol: 'Date',
    particulars: 'Particulars',
    amount: 'Amount',
    balanceCol: 'Balance',
    totalOrders: 'Total Orders',
    totalPaid: 'Total Paid',
    balanceDue: 'Balance Due',
    balanceCredit: 'Advance Credit',
    allSettled: 'All Settled',
    thankYou: 'Thank You!',
    eoe: 'E. & O.E.',
    order: 'Order',
    payment: 'Payment',
  },
  ta: {
    title: 'அறிக்கை',
    to: 'பெறுநர்',
    date: 'தேதி',
    dateCol: 'தேதி',
    particulars: 'விவரம்',
    amount: 'தொகை',
    balanceCol: 'நிலுவை',
    totalOrders: 'மொத்த ஆர்டர்கள்',
    totalPaid: 'மொத்தம் செலுத்தியது',
    balanceDue: 'நிலுவை தொகை',
    balanceCredit: 'முன்பணம்',
    allSettled: 'தீர்வு ஆனது',
    thankYou: 'நன்றி!',
    eoe: 'E. & O.E.',
    order: 'ஆர்டர்',
    payment: 'பணம்',
  },
};

const StatementBill = forwardRef<View, StatementBillProps>(
  (
    {
      companyName,
      companyPlace,
      companyPhone,
      customerName,
      customerPlace,
      date,
      transactions,
      totalOrders,
      totalPaid,
      balance,
      lang = 'en',
    },
    ref,
  ) => {
    const L = LABELS[lang];
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    return (
      <View ref={ref} style={S.container} collapsable={false}>
        {/* ─── Header ────────────────────────────── */}
        <View style={S.header}>
          {companyName ? <Text style={S.companyName}>{companyName}</Text> : null}
          {companyPlace ? <Text style={S.companyPlace}>{companyPlace}</Text> : null}
          {companyPhone ? <Text style={S.companyPhone}>{companyPhone}</Text> : null}
        </View>

        <View style={S.titleBar}>
          <Text style={S.titleText}>{L.title}</Text>
        </View>

        {/* ─── Customer & Date ────────────────────── */}
        <View style={S.metaRow}>
          <View style={S.metaLeft}>
            <Text style={S.metaLabel}>{L.to}</Text>
            <Text style={S.metaValue}>{customerName}</Text>
            {customerPlace ? <Text style={S.metaSub}>{customerPlace}</Text> : null}
          </View>
          <View style={S.metaRight}>
            <Text style={S.metaLabel}>{L.date}</Text>
            <Text style={S.metaValue}>{date}</Text>
          </View>
        </View>

        {/* ─── Table Header ──────────────────────── */}
        <View style={S.tableHeader}>
          <Text style={[S.thText, S.colDate]}>{L.dateCol}</Text>
          <Text style={[S.thText, S.colDesc]}>{L.particulars}</Text>
          <Text style={[S.thText, S.colAmt]}>{L.amount}</Text>
        </View>

        {/* ─── Table Rows ──────────────────────── */}
        {sorted.map((txn, idx) => {
          const isDebit = txn.type === 'debit';
          return (
            <View
              key={txn.id}
              style={[S.tableRow, idx % 2 === 0 ? S.rowEven : S.rowOdd]}
            >
              <Text style={[S.tdText, S.colDate]}>
                {format(new Date(txn.date), 'dd/MM')}
              </Text>
              <Text style={[S.tdText, S.colDesc]} numberOfLines={1}>
                {isDebit
                  ? `${txn.description}${txn.quantity > 0 ? ` x${Math.round(txn.quantity)}` : ''}`
                  : txn.description}
              </Text>
              <Text style={[S.tdText, S.colAmt]}>
                {isDebit ? '' : '-'}{Math.round(txn.amount)}
              </Text>
            </View>
          );
        })}

        {/* ─── Balance Row ─────────────────────── */}
        <View
          style={[
            S.balanceRow,
            balance > 0 ? S.balanceRowDue : balance < 0 ? S.balanceRowCredit : S.balanceRowSettled,
          ]}
        >
          <Text style={[S.balanceRowLabel, balance > 0 ? S.balanceTextDue : balance < 0 ? S.balanceTextCredit : S.balanceTextSettled]}>
            {balance > 0 ? L.balanceDue : balance < 0 ? L.balanceCredit : `✓ ${L.allSettled}`}
          </Text>
          <Text style={[S.balanceRowValue, balance > 0 ? S.balanceTextDue : balance < 0 ? S.balanceTextCredit : S.balanceTextSettled]}>
            ₹{Math.round(Math.abs(balance))}
          </Text>
        </View>

        {/* ─── Footer ────────────────────────────── */}
        <View style={S.footer}>
          <Text style={S.thankYou}>{L.thankYou}</Text>
          <Text style={S.eoe}>{L.eoe}</Text>
        </View>
      </View>
    );
  },
);

StatementBill.displayName = 'StatementBill';
export default StatementBill;

// ─── Styles ─────────────────────────────────────────────────────────

const NAVY = '#1A237E';
const NAVY_LIGHT = '#E8EAF6';
const BORDER = '#C5CAE9';
const TEXT = '#212121';
const TEXT_LIGHT = '#546E7A';
const BALANCE_RED = '#C62828';
const SUCCESS_GREEN = '#2E7D32';
const SUCCESS_BG = '#E8F5E9';
const CREDIT_BLUE = '#1565C0';
const CREDIT_BG = '#E3F2FD';

const S = StyleSheet.create({
  container: {
    width: 380,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    overflow: 'hidden',
  },
  // Header
  header: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  companyName: {
    fontSize: 20,
    fontWeight: '800',
    color: NAVY,
    textAlign: 'center',
    letterSpacing: 1,
  },
  companyPlace: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_LIGHT,
    textAlign: 'center',
    marginTop: 2,
  },
  companyPhone: {
    fontSize: 11,
    fontWeight: '500',
    color: TEXT_LIGHT,
    textAlign: 'center',
    marginTop: 1,
  },
  // Title
  titleBar: {
    backgroundColor: NAVY,
    paddingVertical: 6,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  // Meta
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  metaLeft: { flex: 1, marginRight: 8 },
  metaRight: { alignItems: 'flex-end', flexShrink: 0 },
  metaLabel: {
    fontSize: 10,
    color: TEXT_LIGHT,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 14,
    color: TEXT,
    fontWeight: '700',
    marginTop: 1,
  },
  metaSub: {
    fontSize: 11,
    color: TEXT_LIGHT,
    marginTop: 1,
  },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: NAVY_LIGHT,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  thText: {
    fontSize: 10,
    fontWeight: '700',
    color: NAVY,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  rowEven: { backgroundColor: '#FAFAFA' },
  rowOdd: { backgroundColor: '#FFFFFF' },
  tdText: {
    fontSize: 12,
    color: TEXT,
    fontWeight: '500',
  },
  colDate: { width: 44 },
  colDesc: { flex: 1, paddingHorizontal: 6 },
  colAmt: { width: 64, textAlign: 'right' },
  // Balance row
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderTopWidth: 1.5,
    borderTopColor: BORDER,
  },
  balanceRowDue: { backgroundColor: '#FFEBEE' },
  balanceRowCredit: { backgroundColor: CREDIT_BG },
  balanceRowSettled: { backgroundColor: SUCCESS_BG },
  balanceRowLabel: { fontSize: 13, fontWeight: '800' },
  balanceRowValue: { fontSize: 15, fontWeight: '900' },
  balanceTextDue: { color: BALANCE_RED },
  balanceTextCredit: { color: CREDIT_BLUE },
  balanceTextSettled: { color: SUCCESS_GREEN },
  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 14,
  },
  thankYou: {
    fontSize: 13,
    fontWeight: '700',
    color: NAVY,
    letterSpacing: 0.5,
  },
  eoe: {
    fontSize: 9,
    color: '#9E9E9E',
    marginTop: 2,
  },
});
