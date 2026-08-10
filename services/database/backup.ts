import * as SQLite from 'expo-sqlite';
import { Customer } from './customers';
import { Order } from './orders';
import { Transaction } from './payments';

export async function getAllDataForBackup(db: SQLite.SQLiteDatabase) {
  const [customers, orders, transactions] = await Promise.all([
    db.getAllAsync<Customer>(`SELECT * FROM customers`),
    db.getAllAsync<Order>(`SELECT * FROM orders`),
    db.getAllAsync<Transaction>(`SELECT * FROM transactions`),
  ]);
  return { customers, orders, transactions };
}

/**
 * Older backups carried columns this app no longer keeps — the per-order
 * `amount` that predates the ledger, a short-lived `rate`, and the `bills`
 * grouping the billing step used. All of them are ignored: an order's value
 * comes back from the ledger entries in the same file.
 */
export interface BackupPayload {
  exportedAt: string;
  version: number;
  customers: Customer[];
  orders: (Partial<Order> & { id: number; customer_id: number; description: string; date: string; updated_at: string; amount?: number })[];
  transactions?: Transaction[];
  bills?: unknown[];
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
    await db.execAsync(`DELETE FROM transactions`);
    await db.execAsync(`DELETE FROM orders`);
    await db.execAsync(`DELETE FROM customers`);

    for (const c of payload.customers) {
      await db.runAsync(
        `INSERT INTO customers (id, name, place, phone_number, created_date, updated_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.name, c.place, c.phone_number, c.created_date, c.updated_at, (c as any).status ?? 'active'],
      );
    }

    for (const o of payload.orders) {
      await db.runAsync(
        `INSERT INTO orders (id, customer_id, description, quantity, transaction_id, locked, date, updated_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          o.id, o.customer_id, o.description, o.quantity ?? 0,
          o.transaction_id ?? null, o.locked ?? null, o.date, o.updated_at,
          (o as any).status ?? 'active',
        ],
      );
    }

    if (payload.transactions && payload.transactions.length > 0) {
      // v2 and later — the ledger is in the backup
      for (const t of payload.transactions) {
        await db.runAsync(
          `INSERT INTO transactions (id, customer_id, order_id, type, amount, description, date, locked, status, created_date, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.id, t.customer_id, t.order_id, t.type, t.amount, t.description, t.date,
            t.locked ?? null, (t as any).status ?? 'active', t.created_date, t.updated_at,
          ],
        );
      }
      // bills, bill_items, statements and statement_transactions in older
      // backups are intentionally skipped — those tables are retired.
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

    // As the migration does: an order that never reached the ledger is
    // still waiting to be priced, so it is held open rather than locked by its
    // own date. Orders whose lock was set explicitly keep what the backup says.
    await db.execAsync(`
      UPDATE orders SET locked = 0 WHERE transaction_id IS NULL AND locked IS NULL
    `);
  });

  return { customers: payload.customers.length, orders: payload.orders.length };
}
