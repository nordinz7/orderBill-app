import * as SQLite from 'expo-sqlite';
import { LEDGER_BALANCE } from './helpers';

export interface CustomerOutstanding {
  id: number;
  name: string;
  place: string;
  phone_number: string;
  balance: number;
  last_order_date: string | null;
}

export async function getCustomersWithOutstandingBalance(
  db: SQLite.SQLiteDatabase,
): Promise<CustomerOutstanding[]> {
  return db.getAllAsync<CustomerOutstanding>(`
    SELECT
      c.id, c.name, c.place, c.phone_number,
      COALESCE((SELECT ${LEDGER_BALANCE} FROM transactions t WHERE t.customer_id = c.id), 0) as balance,
      (SELECT MAX(o.date) FROM orders o WHERE o.customer_id = c.id) as last_order_date
    FROM customers c
    WHERE c.status = 'active'
    HAVING balance > 0
    ORDER BY balance DESC
  `);
}

export interface DailySummary {
  total_sales: number;
  order_count: number;
  total_qty: number;
  payment_count: number;
  total_collected: number;
}

export async function getDailySummary(
  db: SQLite.SQLiteDatabase,
  dateStr: string,
): Promise<DailySummary> {
  const orderStats = await db.getFirstAsync<{ total_sales: number; order_count: number; total_qty: number }>(`
    SELECT
      COALESCE(SUM(t.amount), 0) as total_sales,
      COUNT(DISTINCT o.id) as order_count,
      COALESCE(SUM(o.quantity), 0) as total_qty
    FROM orders o
    LEFT JOIN transactions t ON t.order_id = o.id AND t.type = 'debit'
    WHERE date(o.date) = date(?)
  `, [dateStr]);

  const paymentStats = await db.getFirstAsync<{ payment_count: number; total_collected: number }>(`
    SELECT
      COUNT(*) as payment_count,
      COALESCE(SUM(amount), 0) as total_collected
    FROM transactions
    WHERE type = 'credit' AND date(date) = date(?)
  `, [dateStr]);

  return {
    total_sales: orderStats?.total_sales ?? 0,
    order_count: orderStats?.order_count ?? 0,
    total_qty: orderStats?.total_qty ?? 0,
    payment_count: paymentStats?.payment_count ?? 0,
    total_collected: paymentStats?.total_collected ?? 0,
  };
}

export async function getTotalOutstanding(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(${LEDGER_BALANCE}, 0) as total FROM transactions t`
  );
  return row?.total ?? 0;
}
