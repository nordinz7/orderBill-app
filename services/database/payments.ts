import * as SQLite from 'expo-sqlite';
import { isLocked, LockedRecordError, LockFlag, nowISO, SQLParams } from './helpers';

export interface Transaction {
  id: number;
  customer_id: number;
  order_id: number | null;
  type: 'debit' | 'credit';
  amount: number;
  description: string;
  date: string;
  locked: LockFlag;
  created_date: string;
  updated_at: string;
}

export interface TransactionWithQuantity extends Transaction {
  quantity: number;
}

export interface TransactionWithCustomer extends TransactionWithQuantity {
  customer_name: string;
  customer_place: string;
  customer_phone: string;
}

const TXN_SELECT = `
  SELECT t.*, COALESCE(o.quantity, 0) as quantity
  FROM transactions t
  LEFT JOIN orders o ON t.order_id = o.id
`;

const TXN_CUSTOMER_SELECT = `
  SELECT t.*, c.name as customer_name, c.place as customer_place, c.phone_number as customer_phone,
         COALESCE(o.quantity, 0) as quantity
  FROM transactions t
  JOIN customers c ON t.customer_id = c.id
  LEFT JOIN orders o ON t.order_id = o.id
`;

/**
 * Query ledger entries with order quantity attached.
 * `where` is appended to the shared select — tables are aliased t (transactions), o (orders).
 */
export async function queryTransactions(
  db: SQLite.SQLiteDatabase,
  where: string = '',
  params: SQLParams = [],
  orderBy: string = 't.date DESC',
): Promise<TransactionWithQuantity[]> {
  return db.getAllAsync<TransactionWithQuantity>(
    `${TXN_SELECT} ${where} ORDER BY ${orderBy}`,
    params
  );
}

/** Sum debits/credits for the transactions matching `where` (no table alias). */
async function queryBalance(
  db: SQLite.SQLiteDatabase,
  where: string,
  params: SQLParams,
): Promise<{ totalDebit: number; totalCredit: number; balance: number }> {
  const row = await db.getFirstAsync<{ total_debit: number; total_credit: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as total_debit,
       COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) as total_credit
     FROM transactions ${where}`,
    params
  );
  const totalDebit = row?.total_debit ?? 0;
  const totalCredit = row?.total_credit ?? 0;
  return { totalDebit, totalCredit, balance: totalDebit - totalCredit };
}

/**
 * Customers who appear anywhere in the ledger — including those who have only
 * ever paid, or only ever been owed, and so have no order to their name.
 */
export async function getCustomersWithTransactions(
  db: SQLite.SQLiteDatabase,
): Promise<{ id: number; name: string }[]> {
  return db.getAllAsync<{ id: number; name: string }>(
    `SELECT DISTINCT c.id, c.name FROM customers c
     JOIN transactions t ON t.customer_id = c.id
     ORDER BY c.name ASC`
  );
}

export async function getTransactionsByCustomer(
  db: SQLite.SQLiteDatabase, customerId: number,
): Promise<TransactionWithQuantity[]> {
  return queryTransactions(db, `WHERE t.customer_id = ?`, [customerId]);
}

export async function getTransactionsByCustomerUpToDate(
  db: SQLite.SQLiteDatabase, customerId: number, upToDate: string,
): Promise<TransactionWithQuantity[]> {
  return queryTransactions(db, `WHERE t.customer_id = ? AND t.date <= ?`, [customerId, upToDate]);
}

export async function getTransactionsByCustomerForPeriod(
  db: SQLite.SQLiteDatabase, customerId: number, startDate: string, endDate: string,
): Promise<TransactionWithQuantity[]> {
  return queryTransactions(
    db,
    `WHERE t.customer_id = ? AND date(t.date) >= date(?) AND date(t.date) <= date(?)`,
    [customerId, startDate, endDate]
  );
}

export async function getCustomerBalance(
  db: SQLite.SQLiteDatabase, customerId: number,
): Promise<{ totalDebit: number; totalCredit: number; balance: number }> {
  return queryBalance(db, `WHERE customer_id = ?`, [customerId]);
}

export async function getCustomerBalanceUpToDate(
  db: SQLite.SQLiteDatabase, customerId: number, upToDate: string,
): Promise<{ totalDebit: number; totalCredit: number; balance: number }> {
  return queryBalance(db, `WHERE customer_id = ? AND date <= ?`, [customerId, upToDate]);
}

export async function getCustomerBalanceForPeriod(
  db: SQLite.SQLiteDatabase, customerId: number, startDate: string, endDate: string,
): Promise<{ totalDebit: number; totalCredit: number; balance: number }> {
  return queryBalance(
    db,
    `WHERE customer_id = ? AND date(date) >= date(?) AND date(date) <= date(?)`,
    [customerId, startDate, endDate]
  );
}

/** Insert a ledger entry of either sign. `amount` is always positive — `type` carries the direction. */
export async function insertTransaction(
  db: SQLite.SQLiteDatabase,
  customerId: number,
  type: Transaction['type'],
  amount: number,
  description: string,
  date?: string,
): Promise<number> {
  const now = nowISO();
  const result = await db.runAsync(
    `INSERT INTO transactions (customer_id, order_id, type, amount, description, date, created_date, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
    [customerId, type, amount, description.trim(), date || now, now, now]
  );
  return result.lastInsertRowId;
}

export async function insertPayment(
  db: SQLite.SQLiteDatabase, customerId: number, amount: number, description: string = 'Payment received', date?: string,
): Promise<number> {
  return insertTransaction(db, customerId, 'credit', amount, description, date);
}

export async function bulkInsertPayments(
  db: SQLite.SQLiteDatabase,
  payments: { customer_id: number; amount: number; description: string }[],
  date: string,
): Promise<number> {
  let count = 0;
  await db.withTransactionAsync(async () => {
    for (const p of payments) {
      if (p.amount <= 0) continue;
      await insertPayment(db, p.customer_id, p.amount, p.description, date);
      count++;
    }
  });
  return count;
}

export async function insertInitialDebt(
  db: SQLite.SQLiteDatabase,
  customerId: number,
  amount: number,
  description: string = 'Carried forward',
  date?: string,
): Promise<void> {
  await insertTransaction(db, customerId, 'debit', amount, description, date);
}

/** The entry as the lock sees it: its day, and any override on it. */
async function getTransactionLockState(
  db: SQLite.SQLiteDatabase,
  id: number,
): Promise<{ date: string; locked: LockFlag } | null> {
  return db.getFirstAsync<{ date: string; locked: LockFlag }>(
    `SELECT date, locked FROM transactions WHERE id = ?`,
    [id]
  );
}

export async function isTransactionLocked(
  db: SQLite.SQLiteDatabase, id: number,
): Promise<boolean> {
  const row = await getTransactionLockState(db, id);
  return row ? isLocked(row.date, row.locked) : false;
}

/**
 * Hold a ledger entry open (`false`) or shut (`true`) regardless of its date.
 * An entry that belongs to an order is unlocked alongside it, so the two never
 * disagree about whether that sale can still be changed.
 */
export async function setTransactionLock(
  db: SQLite.SQLiteDatabase,
  id: number,
  locked: boolean,
): Promise<void> {
  const now = nowISO();
  const flag = locked ? 1 : 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE transactions SET locked = ?, updated_at = ? WHERE id = ?`, [flag, now, id]);
    await db.runAsync(
      `UPDATE orders SET locked = ?, updated_at = ? WHERE transaction_id = ?`,
      [flag, now, id]
    );
  });
}

/**
 * Update a ledger entry in place. `order_id` is left untouched — an entry that
 * belongs to an order is edited through the order instead.
 */
export async function updateTransaction(
  db: SQLite.SQLiteDatabase,
  transactionId: number,
  customerId: number,
  type: Transaction['type'],
  amount: number,
  description: string,
  date: string,
): Promise<void> {
  const lock = await getTransactionLockState(db, transactionId);
  if (lock && isLocked(lock.date, lock.locked)) throw new LockedRecordError();
  await db.runAsync(
    `UPDATE transactions
     SET customer_id = ?, type = ?, amount = ?, description = ?, date = ?, updated_at = ?
     WHERE id = ?`,
    [customerId, type, amount, description.trim(), date, nowISO(), transactionId]
  );
}

export async function deleteTransaction(
  db: SQLite.SQLiteDatabase, id: number,
): Promise<void> {
  const lock = await getTransactionLockState(db, id);
  if (lock && isLocked(lock.date, lock.locked)) throw new LockedRecordError();
  await db.runAsync(`DELETE FROM transactions WHERE id = ?`, [id]);
}

export async function getTransactionById(
  db: SQLite.SQLiteDatabase, id: number,
): Promise<Transaction | null> {
  return db.getFirstAsync<Transaction>(`SELECT * FROM transactions WHERE id = ?`, [id]);
}

export async function getTransactionsByDateRange(
  db: SQLite.SQLiteDatabase, from: string, to: string,
): Promise<TransactionWithCustomer[]> {
  return db.getAllAsync<TransactionWithCustomer>(
    `${TXN_CUSTOMER_SELECT} WHERE t.date >= ? AND t.date < date(?, '+1 day') ORDER BY t.date DESC, t.id DESC`,
    [from, to]
  );
}

export async function getAllTransactionsWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<TransactionWithCustomer[]> {
  return db.getAllAsync<TransactionWithCustomer>(
    `${TXN_CUSTOMER_SELECT} ORDER BY t.date DESC, t.id DESC`
  );
}
