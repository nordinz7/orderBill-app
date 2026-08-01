import * as SQLite from 'expo-sqlite';
import { Customer } from './customers';
import { Order } from './orders';
import { Transaction } from './payments';
import { Statement, StatementTransaction } from './statements';
import { Bill } from './billing';

interface BackupBillItem {
  id: number;
  bill_id: number;
  order_id: number | null;
  type: string;
  description: string;
  quantity: number;
  amount: number;
}

export async function getAllDataForBackup(db: SQLite.SQLiteDatabase) {
  const customers              = await db.getAllAsync<Customer>(`SELECT * FROM customers`);
  const orders                 = await db.getAllAsync<Order>(`SELECT * FROM orders`);
  const transactions           = await db.getAllAsync<Transaction>(`SELECT * FROM transactions`);
  const statements             = await db.getAllAsync<Statement>(`SELECT * FROM statements`);
  const statement_transactions = await db.getAllAsync<StatementTransaction>(`SELECT * FROM statement_transactions`);
  const bills                  = await db.getAllAsync<Bill>(`SELECT * FROM bills`);
  const bill_items             = await db.getAllAsync<BackupBillItem>(`SELECT * FROM bill_items`);
  return { customers, orders, transactions, statements, statement_transactions, bills, bill_items };
}

export interface BackupPayload {
  exportedAt: string;
  version: number;
  customers: Customer[];
  orders: (Order & { amount?: number })[];
  transactions?: (Transaction & { bill_id?: number | null })[];
  statements?: Statement[];
  statement_transactions?: StatementTransaction[];
  bills?: (Bill & { previous_balance?: number; total_amount?: number; payment_amount?: number; net_amount?: number })[];
  bill_items?: BackupBillItem[];
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
    await db.execAsync(`DELETE FROM bill_items`);
    await db.execAsync(`DELETE FROM bills`);
    await db.execAsync(`DELETE FROM statement_transactions`);
    await db.execAsync(`DELETE FROM statements`);
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
      for (const s of payload.statements ?? []) {
        await db.runAsync(
          `INSERT INTO statements (id, customer_id, from_date, to_date, total_debit, total_credit, balance, sent_via, status, created_date, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.customer_id, s.from_date, s.to_date, s.total_debit, s.total_credit, s.balance, s.sent_via, (s as any).status ?? 'active', s.created_date, s.updated_at],
        );
      }
      for (const st of payload.statement_transactions ?? []) {
        await db.runAsync(
          `INSERT INTO statement_transactions (id, statement_id, transaction_id) VALUES (?, ?, ?)`,
          [st.id, st.statement_id, st.transaction_id],
        );
      }
      for (const b of payload.bills ?? []) {
        await db.runAsync(
          `INSERT INTO bills (id, bill_number, customer_id, bill_date, previous_balance, total_amount, payment_amount, net_amount, notes, status, created_date, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [b.id, b.bill_number, b.customer_id, b.bill_date, b.previous_balance ?? 0, b.total_amount ?? 0, b.payment_amount ?? 0, b.net_amount ?? 0, b.notes, (b as any).status ?? 'active', b.created_date, b.updated_at],
        );
      }
      for (const item of payload.bill_items ?? []) {
        await db.runAsync(
          `INSERT INTO bill_items (id, bill_id, order_id, type, description, quantity, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.bill_id, item.order_id, item.type, item.description, item.quantity, item.amount],
        );
      }
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
