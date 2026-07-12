import * as SQLite from 'expo-sqlite';
import { LEDGER_BALANCE, nowISO } from './helpers';

export interface Customer {
  id: number;
  name: string;
  place: string;
  phone_number: string;
  created_date: string;
  updated_at: string;
}

export interface CustomerWithBalance extends Customer {
  balance: number;
}

export async function getAllCustomers(db: SQLite.SQLiteDatabase): Promise<Customer[]> {
  return db.getAllAsync<Customer>(`SELECT * FROM customers ORDER BY name ASC`);
}

/** Alias of getAllCustomers — soft-delete status is gone, so "active" means all. */
export const getActiveCustomers = getAllCustomers;

export async function getCustomerById(
  db: SQLite.SQLiteDatabase, id: number,
): Promise<Customer | null> {
  return db.getFirstAsync<Customer>(`SELECT * FROM customers WHERE id = ?`, [id]);
}

export async function getCustomersWithBalance(db: SQLite.SQLiteDatabase): Promise<CustomerWithBalance[]> {
  return db.getAllAsync<CustomerWithBalance>(`
    SELECT c.*,
      COALESCE((SELECT ${LEDGER_BALANCE} FROM transactions t WHERE t.customer_id = c.id), 0) as balance
    FROM customers c ORDER BY c.name ASC
  `);
}

export async function addCustomer(
  db: SQLite.SQLiteDatabase,
  name: string,
  place: string,
  phone_number: string,
): Promise<number> {
  const now = nowISO();
  const result = await db.runAsync(
    `INSERT INTO customers (name, place, phone_number, created_date, updated_at, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [name.trim(), place.trim(), phone_number.trim(), now, now]
  );
  return result.lastInsertRowId;
}

/** Normalize phone to digits only for comparison. */
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Bulk-import contacts as customers.
 * Skips contacts whose phone already matches an existing customer.
 * Returns count of newly added customers.
 */
export async function bulkImportContacts(
  db: SQLite.SQLiteDatabase,
  contacts: { name: string; phone: string }[],
): Promise<number> {
  const existing = await db.getAllAsync<{ phone_number: string }>(
    `SELECT phone_number FROM customers`
  );
  const existingSet = new Set(existing.map(e => normalizePhone(e.phone_number)));

  let imported = 0;
  const now = nowISO();
  await db.withTransactionAsync(async () => {
    for (const c of contacts) {
      const phone = normalizePhone(c.phone);
      if (!phone || existingSet.has(phone)) continue;
      await db.runAsync(
        `INSERT INTO customers (name, place, phone_number, created_date, updated_at, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [c.name.trim(), '', phone, now, now]
      );
      existingSet.add(phone);
      imported++;
    }
  });
  return imported;
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
    [name.trim(), place.trim(), phone_number.trim(), nowISO(), id]
  );
}

/** Check if a customer can be deleted (has no orders). */
export async function canDeleteCustomer(
  db: SQLite.SQLiteDatabase,
  id: number,
): Promise<boolean> {
  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM orders WHERE customer_id = ?`,
    [id]
  );
  return (row?.cnt ?? 0) === 0;
}

/** Delete a customer and every row referencing them, in FK-safe order. Caller provides the transaction. */
async function deleteCustomerData(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM bill_items WHERE bill_id IN (SELECT id FROM bills WHERE customer_id = ?)`, [id]);
  await db.runAsync(`DELETE FROM bills WHERE customer_id = ?`, [id]);
  await db.runAsync(`DELETE FROM statement_transactions WHERE statement_id IN (SELECT id FROM statements WHERE customer_id = ?)`, [id]);
  await db.runAsync(`DELETE FROM statements WHERE customer_id = ?`, [id]);
  await db.runAsync(`DELETE FROM transactions WHERE customer_id = ?`, [id]);
  await db.runAsync(`DELETE FROM orders WHERE customer_id = ?`, [id]);
  await db.runAsync(`DELETE FROM customers WHERE id = ?`, [id]);
}

export async function deleteCustomer(
  db: SQLite.SQLiteDatabase,
  id: number,
): Promise<void> {
  await db.withTransactionAsync(() => deleteCustomerData(db, id));
}

/** Bulk delete customers and all their related data. */
export async function bulkDeleteCustomers(
  db: SQLite.SQLiteDatabase,
  ids: number[],
): Promise<{ deleted: number; skipped: number }> {
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      await deleteCustomerData(db, id);
    }
  });
  return { deleted: ids.length, skipped: 0 };
}
