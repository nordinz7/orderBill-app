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
  date: string;
  updated_at: string;
  status: 'active' | 'deleted';
}

export interface OrderWithCustomer extends Order {
  customer_name: string;
  customer_place: string;
  customer_phone: string;
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

  // Non-destructive migrations for existing DBs — ignore errors if column exists
  const migrations = [
    `ALTER TABLE customers ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
  ];
  for (const sql of migrations) {
    try { await db.execAsync(sql); } catch (_) { /* column already exists */ }
  }
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

export async function addOrder(
  db: SQLite.SQLiteDatabase,
  customer_id: number,
  amount: number,
  description: string,
): Promise<number> {
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO orders (customer_id, amount, description, date, updated_at, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [customer_id, amount, description.trim(), now, now]
  );
  return result.lastInsertRowId;
}

export async function softDeleteOrder(
  db: SQLite.SQLiteDatabase,
  id: number,
): Promise<void> {
  await db.runAsync(
    `UPDATE orders SET status = 'deleted', updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  );
}

// ─── Backup ───────────────────────────────────────────────────────────────────

export async function getAllDataForBackup(db: SQLite.SQLiteDatabase) {
  const customers = await db.getAllAsync<Customer>(`SELECT * FROM customers`);
  const orders    = await db.getAllAsync<Order>(`SELECT * FROM orders`);
  return { customers, orders };
}
