import * as SQLite from 'expo-sqlite';

/**
 * Bumped when a release needs a one-time pass over existing rows. Everything
 * else here — creating tables, adding columns, dropping retired ones — is
 * written to be safe to repeat on every launch, so it runs unconditionally.
 */
const SCHEMA_VERSION = 1;

/** 0 on a database from before this app started stamping a version. */
async function getSchemaVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  try {
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    return row?.user_version ?? 0;
  } catch {
    return 0;
  }
}

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

  // An order carries what was sold and at what rate; its value reaches the
  // books through the debit entry in `transactions` that it owns.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS orders (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id    INTEGER NOT NULL REFERENCES customers(id),
      description    TEXT    NOT NULL DEFAULT '',
      quantity       REAL    NOT NULL DEFAULT 0,
      rate           REAL    NOT NULL DEFAULT 0,
      transaction_id INTEGER DEFAULT NULL,
      locked         INTEGER DEFAULT NULL,
      date           TEXT    NOT NULL,
      updated_at     TEXT    NOT NULL DEFAULT '',
      status         TEXT    NOT NULL DEFAULT 'active'
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id   INTEGER NOT NULL REFERENCES customers(id),
      order_id      INTEGER REFERENCES orders(id),
      type          TEXT    NOT NULL,
      amount        REAL    NOT NULL DEFAULT 0,
      description   TEXT    NOT NULL DEFAULT '',
      date          TEXT    NOT NULL,
      locked        INTEGER DEFAULT NULL,
      status        TEXT    NOT NULL DEFAULT 'active',
      created_date  TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL DEFAULT ''
    );
  `);

  // Non-destructive migrations for existing DBs — ignore errors if column exists
  const migrations = [
    `ALTER TABLE customers ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE orders ADD COLUMN quantity REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN rate REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN transaction_id INTEGER DEFAULT NULL`,
    `ALTER TABLE orders ADD COLUMN locked INTEGER DEFAULT NULL`,
    `ALTER TABLE transactions ADD COLUMN locked INTEGER DEFAULT NULL`,
  ];
  for (const sql of migrations) {
    try { await db.execAsync(sql); } catch { /* column already exists */ }
  }

  // Everything below runs once, on the launch that brings a database up to this
  // version — never again. Re-running would undo the user's own later choices,
  // in particular any order they have since locked by hand.
  const version = await getSchemaVersion(db);
  if (version < SCHEMA_VERSION) {
    // Orders used to hold no rate at all — the amount was typed once, later, in
    // the billing screen. Recover a rate from what the order was billed for, so
    // an old order opened for editing shows a sensible number instead of zero.
    // Only `rate` is written: the ledger is left exactly as it stands, so no
    // customer's balance can move during the upgrade.
    try {
      await db.execAsync(`
        UPDATE orders SET rate = COALESCE((
          SELECT t.amount / (CASE WHEN orders.quantity > 0 THEN orders.quantity ELSE 1 END)
          FROM transactions t WHERE t.id = orders.transaction_id
        ), 0)
        WHERE rate = 0 AND transaction_id IS NOT NULL
      `);
    } catch { /* nothing to recover */ }

    // Same again for the per-order `amount` of a much older schema, in case a
    // database still carries one that never made it into the ledger. Dropping
    // that column below would otherwise take the price with it.
    try {
      await db.execAsync(`
        UPDATE orders
        SET rate = amount / (CASE WHEN quantity > 0 THEN quantity ELSE 1 END)
        WHERE rate = 0 AND transaction_id IS NULL AND amount > 0
      `);
    } catch { /* no legacy amount column */ }

    // An order with no ledger entry was taken under the old rules, where pricing
    // came later and "unbilled" was a normal state to sit in. Auto-locking that
    // backlog on its date would strand it, so it is held open instead — the
    // owner can still price it, and lock it afterwards if they want.
    try {
      await db.execAsync(`UPDATE orders SET locked = 0 WHERE transaction_id IS NULL`);
    } catch { /* fresh database — nothing to hold open */ }
  }

  // Retired schema. bill_items was superseded by transactions rows; statements
  // and statement_transactions were only ever written, never read; bills grouped
  // orders for the billing step, which no longer exists. Children first so the
  // FK checks in DROP TABLE's implicit delete pass.
  const retiredTables = ['bill_items', 'statement_transactions', 'statements', 'bills'];
  for (const table of retiredTables) {
    try { await db.execAsync(`DROP TABLE IF EXISTS ${table}`); } catch { /* already gone */ }
  }

  // Retired columns. orders.amount was always 0 — the ledger holds the value —
  // and both bill_id columns pointed at the dropped bills table. Every write
  // omits them, so a failed drop here is harmless.
  const retiredColumns = [
    `ALTER TABLE orders DROP COLUMN amount`,
    `ALTER TABLE orders DROP COLUMN bill_id`,
    `ALTER TABLE transactions DROP COLUMN bill_id`,
  ];
  for (const sql of retiredColumns) {
    try { await db.execAsync(sql); } catch { /* already dropped */ }
  }

  // Clean up previously soft-deleted rows (migration from status-based to hard-delete)
  try {
    await db.execAsync(`DELETE FROM transactions WHERE status = 'deleted'`);
    await db.execAsync(`DELETE FROM orders WHERE status = 'deleted'`);
    await db.execAsync(`DELETE FROM customers WHERE status = 'deleted'`);
  } catch { /* status column may not exist or already cleaned */ }

  // Stamped last: if anything above failed outright, the next launch gets
  // another go at the one-time pass rather than skipping it for good.
  try {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } catch { /* the pass is idempotent enough to survive being repeated */ }
}
