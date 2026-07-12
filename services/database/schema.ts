import * as SQLite from 'expo-sqlite';

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

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS bills (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number      TEXT    NOT NULL UNIQUE,
      customer_id      INTEGER NOT NULL REFERENCES customers(id),
      bill_date        TEXT    NOT NULL,
      previous_balance REAL    NOT NULL DEFAULT 0,
      total_amount     REAL    NOT NULL DEFAULT 0,
      payment_amount   REAL    NOT NULL DEFAULT 0,
      net_amount       REAL    NOT NULL DEFAULT 0,
      notes            TEXT    NOT NULL DEFAULT '',
      status           TEXT    NOT NULL DEFAULT 'active',
      created_date     TEXT    NOT NULL,
      updated_at       TEXT    NOT NULL DEFAULT ''
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS bill_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id     INTEGER NOT NULL REFERENCES bills(id),
      order_id    INTEGER REFERENCES orders(id),
      type        TEXT    NOT NULL DEFAULT 'order',
      description TEXT    NOT NULL DEFAULT '',
      quantity    REAL    NOT NULL DEFAULT 0,
      amount      REAL    NOT NULL DEFAULT 0
    );
  `);

  // Non-destructive migrations for existing DBs — ignore errors if column exists
  const migrations = [
    `ALTER TABLE customers ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE orders ADD COLUMN quantity REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN transaction_id INTEGER DEFAULT NULL`,
    `ALTER TABLE orders ADD COLUMN bill_id INTEGER DEFAULT NULL`,
    `ALTER TABLE transactions ADD COLUMN bill_id INTEGER DEFAULT NULL`,
  ];
  for (const sql of migrations) {
    try { await db.execAsync(sql); } catch { /* column already exists */ }
  }

  // Orders with transaction_id IS NULL are intentionally unbilled — no backfill needed

  // Clean up previously soft-deleted rows (migration from status-based to hard-delete)
  try {
    await db.execAsync(`DELETE FROM statement_transactions WHERE statement_id IN (SELECT id FROM statements WHERE status = 'deleted')`);
    await db.execAsync(`DELETE FROM statements WHERE status = 'deleted'`);
    await db.execAsync(`DELETE FROM transactions WHERE status = 'deleted'`);
    await db.execAsync(`DELETE FROM orders WHERE status = 'deleted'`);
    await db.execAsync(`DELETE FROM customers WHERE status = 'deleted'`);
  } catch { /* status column may not exist or already cleaned */ }
}
