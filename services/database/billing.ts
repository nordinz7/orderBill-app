import * as SQLite from 'expo-sqlite';
import { LEDGER_BALANCE, nowISO } from './helpers';
import { Order, OrderWithCustomer, queryOrders } from './orders';
import { queryTransactions, TransactionWithQuantity } from './payments';

export interface Bill {
  id: number;
  bill_number: string;
  customer_id: number;
  bill_date: string;
  notes: string;
  status: string;
  created_date: string;
  updated_at: string;
}

export interface BillItem {
  orderId: number;
  amount: number;
}

export async function getUnbilledOrders(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return queryOrders(db, `WHERE o.transaction_id IS NULL`);
}

export async function getUnbilledOrdersByDate(
  db: SQLite.SQLiteDatabase,
  fromDate: string,
  toDate: string,
): Promise<OrderWithCustomer[]> {
  return queryOrders(
    db,
    `WHERE o.transaction_id IS NULL AND date(o.date) >= date(?) AND date(o.date) <= date(?)`,
    [fromDate, toDate]
  );
}

export async function getUnbilledOrdersByCustomer(
  db: SQLite.SQLiteDatabase,
  customerId: number,
): Promise<OrderWithCustomer[]> {
  return queryOrders(db, `WHERE o.transaction_id IS NULL AND o.customer_id = ?`, [customerId]);
}

export async function getCustomersWithUnbilledOrders(
  db: SQLite.SQLiteDatabase,
): Promise<{ id: number; name: string; place: string; unbilled_count: number }[]> {
  return db.getAllAsync<{ id: number; name: string; place: string; unbilled_count: number }>(
    `SELECT c.id, c.name, c.place, COUNT(o.id) as unbilled_count
     FROM customers c
     JOIN orders o ON o.customer_id = c.id
     WHERE o.transaction_id IS NULL
     GROUP BY c.id
     ORDER BY c.name ASC`
  );
}

async function generateBillNumber(
  db: SQLite.SQLiteDatabase,
  customerId: number,
  billDate: string,
): Promise<string> {
  const dateStr = billDate.replace(/-/g, '');
  const prefix = `${dateStr}-${customerId}`;
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM bills WHERE customer_id = ? AND bill_date = ?`,
    [customerId, billDate]
  );
  const count = (row?.cnt ?? 0) + 1;
  return count === 1 ? prefix : `${prefix}-${String(count).padStart(2, '0')}`;
}

export async function billOrders(
  db: SQLite.SQLiteDatabase,
  customerId: number,
  items: BillItem[],
): Promise<{ billId: number; transactionIds: number[] }> {
  const now = nowISO();
  const billDate = now.slice(0, 10);
  const transactionIds: number[] = [];
  let billId = 0;
  await db.withTransactionAsync(async () => {
    const billNumber = await generateBillNumber(db, customerId, billDate);

    // Bill is just a grouping document — no stored totals
    const billResult = await db.runAsync(
      `INSERT INTO bills (bill_number, customer_id, bill_date, previous_balance, total_amount, payment_amount, net_amount, notes, created_date, updated_at)
       VALUES (?, ?, ?, 0, 0, 0, 0, '', ?, ?)`,
      [billNumber, customerId, billDate, now, now]
    );
    billId = billResult.lastInsertRowId;

    for (const item of items) {
      const order = await db.getFirstAsync<Order>(
        `SELECT * FROM orders WHERE id = ? AND customer_id = ?`,
        [item.orderId, customerId]
      );
      if (!order || order.transaction_id !== null) continue;
      // Ledger entry — the single source of truth
      const txnResult = await db.runAsync(
        `INSERT INTO transactions (customer_id, order_id, bill_id, type, amount, description, date, created_date, updated_at)
         VALUES (?, ?, ?, 'debit', ?, ?, ?, ?, ?)`,
        [customerId, item.orderId, billId, item.amount, order.description, order.date, now, now]
      );
      const txnId = txnResult.lastInsertRowId;
      transactionIds.push(txnId);
      await db.runAsync(
        `UPDATE orders SET transaction_id = ?, bill_id = ?, updated_at = ? WHERE id = ?`,
        [txnId, billId, now, item.orderId]
      );
    }
  });
  return { billId, transactionIds };
}

export async function unbillOrder(
  db: SQLite.SQLiteDatabase,
  orderId: number,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const order = await db.getFirstAsync<{ transaction_id: number | null }>(
      `SELECT transaction_id FROM orders WHERE id = ?`,
      [orderId]
    );
    if (order?.transaction_id === null || order?.transaction_id === undefined) {
      throw new Error('Order is not billed');
    }
    await db.runAsync(`DELETE FROM statement_transactions WHERE transaction_id = ?`, [order.transaction_id]);
    await db.runAsync(`DELETE FROM transactions WHERE id = ?`, [order.transaction_id]);
    await db.runAsync(`UPDATE orders SET transaction_id = NULL, amount = 0 WHERE id = ?`, [orderId]);
  });
}

export async function updateBilledAmount(
  db: SQLite.SQLiteDatabase, transactionId: number, newAmount: number,
): Promise<void> {
  const now = nowISO();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE transactions SET amount = ?, updated_at = ? WHERE id = ?`,
      [newAmount, now, transactionId]
    );
    const txn = await db.getFirstAsync<{ order_id: number | null }>(
      `SELECT order_id FROM transactions WHERE id = ?`, [transactionId]
    );
    if (txn?.order_id) {
      await db.runAsync(
        `UPDATE orders SET updated_at = ? WHERE id = ?`,
        [now, txn.order_id]
      );
    }
  });
}

export async function getOrderIdsByBillId(
  db: SQLite.SQLiteDatabase, billId: number,
): Promise<number[]> {
  const rows = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM orders WHERE bill_id = ?`, [billId]
  );
  return rows.map(r => r.id);
}

export async function getBillById(
  db: SQLite.SQLiteDatabase, id: number,
): Promise<Bill | null> {
  return db.getFirstAsync<Bill>(`SELECT * FROM bills WHERE id = ?`, [id]);
}

/** Derive bill total from ledger (sum of debit entries linked to this bill). */
export async function getBillTotal(
  db: SQLite.SQLiteDatabase, billId: number,
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE bill_id = ? AND type = 'debit'`,
    [billId]
  );
  return row?.total ?? 0;
}

/** Derive bill balance from ledger (debits minus credits linked to this bill). */
export async function getBillBalance(
  db: SQLite.SQLiteDatabase, billId: number,
): Promise<number> {
  const row = await db.getFirstAsync<{ balance: number }>(
    `SELECT COALESCE(${LEDGER_BALANCE}, 0) as balance FROM transactions t WHERE t.bill_id = ?`,
    [billId]
  );
  return row?.balance ?? 0;
}

/** Get all ledger entries for a bill. */
export async function getBillLedgerEntries(
  db: SQLite.SQLiteDatabase, billId: number,
): Promise<TransactionWithQuantity[]> {
  return queryTransactions(db, `WHERE t.bill_id = ?`, [billId], 't.date ASC');
}

/** Get outstanding (unpaid) bills for a customer, with balance derived from ledger. */
export async function getCustomerOutstandingBills(
  db: SQLite.SQLiteDatabase, customerId: number,
): Promise<{ id: number; bill_number: string; bill_date: string; total: number; paid: number; balance: number }[]> {
  return db.getAllAsync<{ id: number; bill_number: string; bill_date: string; total: number; paid: number; balance: number }>(`
    SELECT
      b.id, b.bill_number, b.bill_date,
      COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) as total,
      COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END), 0) as paid,
      COALESCE(${LEDGER_BALANCE}, 0) as balance
    FROM bills b
    LEFT JOIN transactions t ON t.bill_id = b.id
    WHERE b.customer_id = ?
    GROUP BY b.id
    HAVING balance > 0
    ORDER BY b.bill_date ASC
  `, [customerId]);
}
