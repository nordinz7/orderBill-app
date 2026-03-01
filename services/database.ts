import * as SQLite from 'expo-sqlite';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Customer {
  id: number;
  name: string;
  place: string;
  phone_number: string;
  created_date: string;
  updated_at: string;
  status: 'active' | 'deleted';
}

export interface Order {
  id: number;
  customer_id: number;
  amount: number;
  description: string;
  quantity: number;
  transaction_id: number | null;
  date: string;
  updated_at: string;
  status: 'active' | 'deleted';
}

export interface OrderWithCustomer extends Order {
  customer_name: string;
  customer_place: string;
  customer_phone: string;
}

export interface Transaction {
  id: number;
  customer_id: number;
  order_id: number | null;
  type: 'debit' | 'credit';
  amount: number;
  description: string;
  date: string;
  status: 'active' | 'deleted';
  created_date: string;
  updated_at: string;
}

export interface Statement {
  id: number;
  customer_id: number;
  from_date: string;
  to_date: string;
  total_debit: number;
  total_credit: number;
  balance: number;
  sent_via: string;
  status: 'active' | 'deleted';
  created_date: string;
  updated_at: string;
}

export interface StatementTransaction {
  id: number;
  statement_id: number;
  transaction_id: number;
}

export interface CustomerWithBalance extends Customer {
  balance: number;
}

// ─── DB Initialisation + Migrations ──────────────────────────────────────────

export async function initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // Create tables (includes all columns from the start)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS customers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      place        TEXT    NOT NULL DEFAULT '',
      phone_number TEXT    NOT NULL DEFAULT '',
      created_date TEXT    NOT NULL,
      updated_at   TEXT    NOT NULL DEFAULT '',
      status       TEXT    NOT NULL DEFAULT 'active'
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS orders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      amount      REAL    NOT NULL DEFAULT 0,
      description TEXT    NOT NULL DEFAULT '',
      date        TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL DEFAULT '',
      status      TEXT    NOT NULL DEFAULT 'active'
    );
  `);

  // New tables for ledger system
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id   INTEGER NOT NULL REFERENCES customers(id),
      order_id      INTEGER REFERENCES orders(id),
      type          TEXT    NOT NULL,
      amount        REAL    NOT NULL DEFAULT 0,
      description   TEXT    NOT NULL DEFAULT '',
      date          TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'active',
      created_date  TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL DEFAULT ''
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS statements (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id   INTEGER NOT NULL REFERENCES customers(id),
      from_date     TEXT    NOT NULL,
      to_date       TEXT    NOT NULL,
      total_debit   REAL    NOT NULL DEFAULT 0,
      total_credit  REAL    NOT NULL DEFAULT 0,
      balance       REAL    NOT NULL DEFAULT 0,
      sent_via      TEXT    NOT NULL DEFAULT '',
      status        TEXT    NOT NULL DEFAULT 'active',
      created_date  TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL DEFAULT ''
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS statement_transactions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id    INTEGER NOT NULL REFERENCES statements(id),
      transaction_id  INTEGER NOT NULL REFERENCES transactions(id)
    );
  `);

  // Non-destructive migrations for existing DBs — ignore errors if column exists
  const migrations = [
    `ALTER TABLE customers ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE orders ADD COLUMN quantity REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN transaction_id INTEGER DEFAULT NULL`,
  ];
  for (const sql of migrations) {
    try { await db.execAsync(sql); } catch { /* column already exists */ }
  }

  // Retroactively create debit transactions for orders that don't have one
  try {
    const orphanOrders = await db.getAllAsync<{ id: number; customer_id: number; amount: number; description: string; date: string }>(
      `SELECT id, customer_id, amount, description, date FROM orders WHERE transaction_id IS NULL AND status = 'active'`
    );
    for (const o of orphanOrders) {
      const txn = await db.runAsync(
        `INSERT INTO transactions (customer_id, order_id, type, amount, description, date, status, created_date, updated_at)
         VALUES (?, ?, 'debit', ?, ?, ?, 'active', ?, ?)`,
        [o.customer_id, o.id, o.amount, o.description, o.date, o.date, o.date]
      );
      await db.runAsync(`UPDATE orders SET transaction_id = ? WHERE id = ?`, [txn.lastInsertRowId, o.id]);
    }
  } catch { /* migration already done or no orphan orders */ }
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function getActiveCustomers(db: SQLite.SQLiteDatabase): Promise<Customer[]> {
  return db.getAllAsync<Customer>(
    `SELECT * FROM customers WHERE status = 'active' ORDER BY name ASC`
  );
}

export async function getAllCustomers(db: SQLite.SQLiteDatabase): Promise<Customer[]> {
  return db.getAllAsync<Customer>(`SELECT * FROM customers ORDER BY name ASC`);
}

export async function getActiveCustomersWithBalance(db: SQLite.SQLiteDatabase): Promise<CustomerWithBalance[]> {
  return db.getAllAsync<CustomerWithBalance>(`
    SELECT c.*,
      COALESCE((
        SELECT SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE -t.amount END)
        FROM transactions t WHERE t.customer_id = c.id AND t.status = 'active'
      ), 0) as balance
    FROM customers c WHERE c.status = 'active' ORDER BY c.name ASC
  `);
}

export async function getAllCustomersWithBalance(db: SQLite.SQLiteDatabase): Promise<CustomerWithBalance[]> {
  return db.getAllAsync<CustomerWithBalance>(`
    SELECT c.*,
      COALESCE((
        SELECT SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE -t.amount END)
        FROM transactions t WHERE t.customer_id = c.id AND t.status = 'active'
      ), 0) as balance
    FROM customers c ORDER BY c.name ASC
  `);
}

export async function addCustomer(
  db: SQLite.SQLiteDatabase,
  name: string,
  place: string,
  phone_number: string,
): Promise<number> {
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO customers (name, place, phone_number, created_date, updated_at, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [name.trim(), place.trim(), phone_number.trim(), now, now]
  );
  return result.lastInsertRowId;
}

export async function updateCustomer(
  db: SQLite.SQLiteDatabase,
  id: number,
  name: string,
  place: string,
  phone_number: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE customers SET name = ?, place = ?, phone_number = ?, updated_at = ?
     WHERE id = ?`,
    [name.trim(), place.trim(), phone_number.trim(), new Date().toISOString(), id]
  );
}

export async function softDeleteCustomer(
  db: SQLite.SQLiteDatabase,
  id: number,
): Promise<void> {
  await db.runAsync(
    `UPDATE customers SET status = 'deleted', updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  );
}

// ─── Orders ───────────────────────────────────────────────────────────────────

const ORDER_SELECT = `
  SELECT
    o.*,
    c.name         AS customer_name,
    c.place        AS customer_place,
    c.phone_number AS customer_phone
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  WHERE o.status = 'active'
`;

export async function getAllOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} ORDER BY o.date DESC`
  );
}

export async function getRecentOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} AND o.date >= date('now', '-6 days') ORDER BY o.date DESC`
  );
}

export async function getTodayOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} AND date(o.date) = date('now','localtime') ORDER BY o.date DESC`
  );
}

export async function getYesterdayOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} AND date(o.date) = date('now','localtime','-1 day') ORDER BY o.date DESC`
  );
}

export async function getThisWeekOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} AND o.date >= date('now','localtime','weekday 0','-7 days') ORDER BY o.date DESC`
  );
}

export async function getThisMonthOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} AND strftime('%Y-%m', o.date) = strftime('%Y-%m', 'now','localtime') ORDER BY o.date DESC`
  );
}

export async function addOrder(
  db: SQLite.SQLiteDatabase,
  customer_id: number,
  amount: number,
  description: string,
  quantity: number = 0,
): Promise<number> {
  const now = new Date().toISOString();
  let orderId = 0;
  await db.withTransactionAsync(async () => {
    const orderResult = await db.runAsync(
      `INSERT INTO orders (customer_id, amount, description, quantity, date, updated_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [customer_id, amount, description.trim(), quantity, now, now]
    );
    orderId = orderResult.lastInsertRowId;
    const txnResult = await db.runAsync(
      `INSERT INTO transactions (customer_id, order_id, type, amount, description, date, status, created_date, updated_at)
       VALUES (?, ?, 'debit', ?, ?, ?, 'active', ?, ?)`,
      [customer_id, orderId, amount, description.trim(), now, now, now]
    );
    await db.runAsync(`UPDATE orders SET transaction_id = ? WHERE id = ?`, [txnResult.lastInsertRowId, orderId]);
  });
  return orderId;
}

export async function softDeleteOrder(
  db: SQLite.SQLiteDatabase,
  id: number,
): Promise<void> {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE transactions SET status = 'deleted', updated_at = ? WHERE order_id = ? AND status = 'active'`,
      [now, id]
    );
    await db.runAsync(
      `UPDATE orders SET status = 'deleted', updated_at = ? WHERE id = ?`,
      [now, id]
    );
  });
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactionsByCustomer(
  db: SQLite.SQLiteDatabase, customerId: number,
): Promise<Transaction[]> {
  return db.getAllAsync<Transaction>(
    `SELECT * FROM transactions WHERE customer_id = ? AND status = 'active' ORDER BY date DESC`,
    [customerId]
  );
}

export async function getCustomerBalance(
  db: SQLite.SQLiteDatabase, customerId: number,
): Promise<{ totalDebit: number; totalCredit: number; balance: number }> {
  const row = await db.getFirstAsync<{ total_debit: number; total_credit: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as total_debit,
       COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) as total_credit
     FROM transactions WHERE customer_id = ? AND status = 'active'`,
    [customerId]
  );
  const totalDebit = row?.total_debit ?? 0;
  const totalCredit = row?.total_credit ?? 0;
  return { totalDebit, totalCredit, balance: totalDebit - totalCredit };
}

export async function insertPayment(
  db: SQLite.SQLiteDatabase, customerId: number, amount: number, description: string = 'Payment received',
): Promise<number> {
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO transactions (customer_id, order_id, type, amount, description, date, status, created_date, updated_at)
     VALUES (?, NULL, 'credit', ?, ?, ?, 'active', ?, ?)`,
    [customerId, amount, description.trim(), now, now, now]
  );
  return result.lastInsertRowId;
}

export async function softDeleteTransaction(
  db: SQLite.SQLiteDatabase, id: number,
): Promise<void> {
  await db.runAsync(
    `UPDATE transactions SET status = 'deleted', updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  );
}

// ─── Statements ───────────────────────────────────────────────────────────────

export async function insertStatement(
  db: SQLite.SQLiteDatabase,
  customerId: number, transactionIds: number[],
  totalDebit: number, totalCredit: number, balance: number,
  fromDate: string, sentVia: string = 'whatsapp',
): Promise<number> {
  const now = new Date().toISOString();
  let statementId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO statements (customer_id, from_date, to_date, total_debit, total_credit, balance, sent_via, status, created_date, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [customerId, fromDate, now, totalDebit, totalCredit, balance, sentVia, now, now]
    );
    statementId = result.lastInsertRowId;
    for (const txnId of transactionIds) {
      await db.runAsync(
        `INSERT INTO statement_transactions (statement_id, transaction_id) VALUES (?, ?)`,
        [statementId, txnId]
      );
    }
  });
  return statementId;
}

export async function getCustomerById(
  db: SQLite.SQLiteDatabase, id: number,
): Promise<Customer | null> {
  return db.getFirstAsync<Customer>(`SELECT * FROM customers WHERE id = ?`, [id]);
}

// ─── Backup ───────────────────────────────────────────────────────────────────

export async function getAllDataForBackup(db: SQLite.SQLiteDatabase) {
  const customers              = await db.getAllAsync<Customer>(`SELECT * FROM customers`);
  const orders                 = await db.getAllAsync<Order>(`SELECT * FROM orders`);
  const transactions           = await db.getAllAsync<Transaction>(`SELECT * FROM transactions`);
  const statements             = await db.getAllAsync<Statement>(`SELECT * FROM statements`);
  const statement_transactions = await db.getAllAsync<StatementTransaction>(`SELECT * FROM statement_transactions`);
  return { customers, orders, transactions, statements, statement_transactions };
}

// ─── Restore ──────────────────────────────────────────────────────────────────

export interface BackupPayload {
  exportedAt: string;
  version: number;
  customers: Customer[];
  orders: Order[];
  transactions?: Transaction[];
  statements?: Statement[];
  statement_transactions?: StatementTransaction[];
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
        [c.id, c.name, c.place, c.phone_number, c.created_date, c.updated_at, c.status],
      );
    }

    // Re-insert orders (handle v1 backups that lack quantity/transaction_id)
    for (const o of payload.orders) {
      await db.runAsync(
        `INSERT INTO orders (id, customer_id, amount, description, quantity, transaction_id, date, updated_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [o.id, o.customer_id, o.amount, o.description, o.quantity ?? 0, o.transaction_id ?? null, o.date, o.updated_at, o.status],
      );
    }

    if (payload.transactions && payload.transactions.length > 0) {
      // v2 backup — restore all ledger data
      for (const t of payload.transactions) {
        await db.runAsync(
          `INSERT INTO transactions (id, customer_id, order_id, type, amount, description, date, status, created_date, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.id, t.customer_id, t.order_id, t.type, t.amount, t.description, t.date, t.status, t.created_date, t.updated_at],
        );
      }
      for (const s of payload.statements ?? []) {
        await db.runAsync(
          `INSERT INTO statements (id, customer_id, from_date, to_date, total_debit, total_credit, balance, sent_via, status, created_date, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.customer_id, s.from_date, s.to_date, s.total_debit, s.total_credit, s.balance, s.sent_via, s.status, s.created_date, s.updated_at],
        );
      }
      for (const st of payload.statement_transactions ?? []) {
        await db.runAsync(
          `INSERT INTO statement_transactions (id, statement_id, transaction_id) VALUES (?, ?, ?)`,
          [st.id, st.statement_id, st.transaction_id],
        );
      }
    } else {
      // v1 backup — retroactively create debit transactions for active orders
      for (const o of payload.orders) {
        if (o.status === 'active') {
          const txn = await db.runAsync(
            `INSERT INTO transactions (customer_id, order_id, type, amount, description, date, status, created_date, updated_at)
             VALUES (?, ?, 'debit', ?, ?, ?, 'active', ?, ?)`,
            [o.customer_id, o.id, o.amount, o.description, o.date, o.date, o.date],
          );
          await db.runAsync(`UPDATE orders SET transaction_id = ? WHERE id = ?`, [txn.lastInsertRowId, o.id]);
        }
      }
    }
  });

  return { customers: payload.customers.length, orders: payload.orders.length };
}
