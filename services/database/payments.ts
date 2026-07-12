import * as SQLite from 'expo-sqlite';

export interface Transaction {
  id: number;
  customer_id: number;
  order_id: number | null;
  bill_id: number | null;
  type: 'debit' | 'credit';
  amount: number;
  description: string;
  date: string;
  created_date: string;
  updated_at: string;
}

export interface TransactionWithQuantity extends Transaction {
  quantity: number;
}

export interface TransactionWithCustomer extends Transaction {
  customer_name: string;
  customer_place: string;
  customer_phone: string;
  quantity: number;
}

export async function getTransactionsByCustomer(
  db: SQLite.SQLiteDatabase, customerId: number,
): Promise<TransactionWithQuantity[]> {
  return db.getAllAsync<TransactionWithQuantity>(
    `SELECT t.*, COALESCE(o.quantity, 0) as quantity
     FROM transactions t
     LEFT JOIN orders o ON t.order_id = o.id
     WHERE t.customer_id = ?
     ORDER BY t.date DESC`,
    [customerId]
  );
}

export async function getTransactionsByCustomerUpToDate(
  db: SQLite.SQLiteDatabase, customerId: number, upToDate: string,
): Promise<TransactionWithQuantity[]> {
  return db.getAllAsync<TransactionWithQuantity>(
    `SELECT t.*, COALESCE(o.quantity, 0) as quantity
     FROM transactions t
     LEFT JOIN orders o ON t.order_id = o.id
     WHERE t.customer_id = ? AND t.date <= ?
     ORDER BY t.date DESC`,
    [customerId, upToDate]
  );
}

export async function getCustomerBalanceUpToDate(
  db: SQLite.SQLiteDatabase, customerId: number, upToDate: string,
): Promise<{ totalDebit: number; totalCredit: number; balance: number }> {
  const row = await db.getFirstAsync<{ total_debit: number; total_credit: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as total_debit,
       COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) as total_credit
     FROM transactions WHERE customer_id = ? AND date <= ?`,
    [customerId, upToDate]
  );
  const totalDebit = row?.total_debit ?? 0;
  const totalCredit = row?.total_credit ?? 0;
  return { totalDebit, totalCredit, balance: totalDebit - totalCredit };
}

export async function getCustomerBalanceForPeriod(
  db: SQLite.SQLiteDatabase, customerId: number, startDate: string, endDate: string,
): Promise<{ totalDebit: number; totalCredit: number; balance: number }> {
  const row = await db.getFirstAsync<{ total_debit: number; total_credit: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as total_debit,
       COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) as total_credit
     FROM transactions WHERE customer_id = ? AND date(date) >= date(?) AND date(date) <= date(?)`,
    [customerId, startDate, endDate]
  );
  const totalDebit = row?.total_debit ?? 0;
  const totalCredit = row?.total_credit ?? 0;
  return { totalDebit, totalCredit, balance: totalDebit - totalCredit };
}

export async function getTransactionsByCustomerForPeriod(
  db: SQLite.SQLiteDatabase, customerId: number, startDate: string, endDate: string,
): Promise<TransactionWithQuantity[]> {
  return db.getAllAsync<TransactionWithQuantity>(
    `SELECT t.*, COALESCE(o.quantity, 0) as quantity
     FROM transactions t
     LEFT JOIN orders o ON t.order_id = o.id
     WHERE t.customer_id = ? AND date(t.date) >= date(?) AND date(t.date) <= date(?)
     ORDER BY t.date DESC`,
    [customerId, startDate, endDate]
  );
}

export async function getCustomerBalance(
  db: SQLite.SQLiteDatabase, customerId: number,
): Promise<{ totalDebit: number; totalCredit: number; balance: number }> {
  const row = await db.getFirstAsync<{ total_debit: number; total_credit: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as total_debit,
       COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) as total_credit
     FROM transactions WHERE customer_id = ?`,
    [customerId]
  );
  const totalDebit = row?.total_debit ?? 0;
  const totalCredit = row?.total_credit ?? 0;
  return { totalDebit, totalCredit, balance: totalDebit - totalCredit };
}

export async function insertPayment(
  db: SQLite.SQLiteDatabase, customerId: number, amount: number, description: string = 'Payment received', date?: string, billId?: number | null,
): Promise<number> {
  const now = new Date().toISOString();
  const txnDate = date || now;
  const result = await db.runAsync(
    `INSERT INTO transactions (customer_id, order_id, bill_id, type, amount, description, date, created_date, updated_at)
     VALUES (?, NULL, ?, 'credit', ?, ?, ?, ?, ?)`,
    [customerId, billId ?? null, amount, description.trim(), txnDate, now, now]
  );
  return result.lastInsertRowId;
}

export async function bulkInsertPayments(
  db: SQLite.SQLiteDatabase,
  payments: { customer_id: number; amount: number; description: string }[],
  date: string,
): Promise<number> {
  const now = new Date().toISOString();
  let count = 0;
  await db.withTransactionAsync(async () => {
    for (const p of payments) {
      if (p.amount <= 0) continue;
      await db.runAsync(
        `INSERT INTO transactions (customer_id, order_id, bill_id, type, amount, description, date, created_date, updated_at)
         VALUES (?, NULL, NULL, 'credit', ?, ?, ?, ?, ?)`,
        [p.customer_id, p.amount, p.description.trim(), date, now, now]
      );
      count++;
    }
  });
  return count;
}

export async function deleteTransaction(
  db: SQLite.SQLiteDatabase, id: number,
): Promise<void> {
  await db.runAsync(`DELETE FROM transactions WHERE id = ?`, [id]);
}

export async function updatePayment(
  db: SQLite.SQLiteDatabase, transactionId: number, amount: number, description: string, date: string, billId?: number | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE transactions SET amount = ?, description = ?, date = ?, bill_id = ?, updated_at = ? WHERE id = ?`,
    [amount, description.trim(), date, billId ?? null, now, transactionId]
  );
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
    `SELECT t.*, c.name as customer_name, c.place as customer_place, c.phone_number as customer_phone,
            COALESCE(o.quantity, 0) as quantity
     FROM transactions t
     JOIN customers c ON t.customer_id = c.id
     LEFT JOIN orders o ON t.order_id = o.id
     WHERE t.date >= ? AND t.date < date(?, '+1 day')
     ORDER BY t.date DESC, t.id DESC`,
    [from, to]
  );
}

export async function getAllTransactionsWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<TransactionWithCustomer[]> {
  return db.getAllAsync<TransactionWithCustomer>(
    `SELECT t.*, c.name as customer_name, c.place as customer_place, c.phone_number as customer_phone,
            COALESCE(o.quantity, 0) as quantity
     FROM transactions t
     JOIN customers c ON t.customer_id = c.id
     LEFT JOIN orders o ON t.order_id = o.id
     ORDER BY t.date DESC, t.id DESC`
  );
}
