import * as SQLite from 'expo-sqlite';
import { Customer } from './customers';
import { Order } from './orders';
import { Transaction } from './payments';
import { Bill } from './billing';

export async function getAllDataForBackup(db: SQLite.SQLiteDatabase) {
  const [customers, orders, transactions, bills] = await Promise.all([
    db.getAllAsync<Customer>(`SELECT * FROM customers`),
    db.getAllAsync<Order>(`SELECT * FROM orders`),
    db.getAllAsync<Transaction>(`SELECT * FROM transactions`),
    db.getAllAsync<Bill>(`SELECT * FROM bills`),
  ]);
  return { customers, orders, transactions, bills };
}

export interface BackupPayload {
  exportedAt: string;
  version: number;
  customers: Customer[];
  orders: (Order & { amount?: number })[];
  transactions?: (Transaction & { bill_id?: number | null })[];
  bills?: (Bill & { previous_balance?: number; total_amount?: number; payment_amount?: number; net_amount?: number })[];
}

/**
 * Validates that the parsed JSON matches the expected backup schema.
 */
export function isValidBackup(data: unknown): data is BackupPayload {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    Array.isArray(obj.customers) &&
    Array.isArray(obj.orders)
  );
}

/**
 * Replaces all existing data with the contents of a backup file.
 * Runs inside a transaction so it's all-or-nothing.
 */
export async function restoreFromBackupData(
  db: SQLite.SQLiteDatabase,
  payload: BackupPayload,
): Promise<{ customers: number; orders: number }> {
  await db.withTransactionAsync(async () => {
    // Clear all tables (respect FK ordering)
    await db.execAsync(`DELETE FROM bills`);
    await db.execAsync(`DELETE FROM transactions`);
    await db.execAsync(`DELETE FROM orders`);
    await db.execAsync(`DELETE FROM customers`);

    // Re-insert customers
    for (const c of payload.customers) {
      await db.runAsync(
        `INSERT INTO customers (id, name, place, phone_number, created_date, updated_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.name, c.place, c.phone_number, c.created_date, c.updated_at, (c as any).status ?? 'active'],
      );
    }

    // Re-insert orders (amount column kept in DB as 0 for backward compat)
    for (const o of payload.orders) {
      await db.runAsync(
        `INSERT INTO orders (id, customer_id, amount, description, quantity, transaction_id, bill_id, date, updated_at, status)
         VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        [o.id, o.customer_id, o.description, o.quantity ?? 0, o.transaction_id ?? null, o.bill_id ?? null, o.date, o.updated_at, (o as any).status ?? 'active'],
      );
    }

    if (payload.transactions && payload.transactions.length > 0) {
      // v2 backup — restore all ledger data
      for (const t of payload.transactions) {
        await db.runAsync(
          `INSERT INTO transactions (id, customer_id, order_id, bill_id, type, amount, description, date, status, created_date, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.id, t.customer_id, t.order_id, t.bill_id ?? null, t.type, t.amount, t.description, t.date, (t as any).status ?? 'active', t.created_date, t.updated_at],
        );
      }
      for (const b of payload.bills ?? []) {
        await db.runAsync(
          `INSERT INTO bills (id, bill_number, customer_id, bill_date, previous_balance, total_amount, payment_amount, net_amount, notes, status, created_date, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [b.id, b.bill_number, b.customer_id, b.bill_date, b.previous_balance ?? 0, b.total_amount ?? 0, b.payment_amount ?? 0, b.net_amount ?? 0, b.notes, (b as any).status ?? 'active', b.created_date, b.updated_at],
        );
      }
      // bill_items, statements and statement_transactions in older backups are
      // intentionally skipped — those tables are retired.
    } else {
      // v1 backup — retroactively create debit transactions for active orders
      for (const o of payload.orders) {
        if ((o as any).status !== 'deleted') {
          const backupAmount = o.amount ?? 0;
          const txn = await db.runAsync(
            `INSERT INTO transactions (customer_id, order_id, type, amount, description, date, status, created_date, updated_at)
             VALUES (?, ?, 'debit', ?, ?, ?, 'active', ?, ?)`,
            [o.customer_id, o.id, backupAmount, o.description, o.date, o.date, o.date],
          );
          await db.runAsync(`UPDATE orders SET transaction_id = ? WHERE id = ?`, [txn.lastInsertRowId, o.id]);
        }
      }
    }
  });

  return { customers: payload.customers.length, orders: payload.orders.length };
}
