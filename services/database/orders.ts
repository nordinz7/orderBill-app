import * as SQLite from 'expo-sqlite';
import { isLocked, LockedRecordError, LockFlag, nowISO, SQLParams } from './helpers';

export interface Order {
  id: number;
  customer_id: number;
  description: string;
  quantity: number;
  /** Selling rate for one unit. The order's value is this times the quantity. */
  rate: number;
  transaction_id: number | null;
  locked: LockFlag;
  date: string;
  updated_at: string;
}

export interface OrderWithCustomer extends Order {
  customer_name: string;
  customer_place: string;
  customer_phone: string;
  /** Value of this order as it stands in the ledger. */
  amount: number;
}

const ORDER_SELECT = `
  SELECT
    o.*,
    COALESCE(t.amount, 0) AS amount,
    c.name         AS customer_name,
    c.place        AS customer_place,
    c.phone_number AS customer_phone
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  LEFT JOIN transactions t ON t.order_id = o.id AND t.type = 'debit'
`;

/**
 * What an order is worth. A quantity of zero is read as a single unit rather
 * than as nothing, so an order entered as a flat price still carries its value.
 */
export function orderAmount(quantity: number, rate: number): number {
  const units = quantity > 0 ? quantity : 1;
  return Math.round(units * rate * 100) / 100;
}

/**
 * Query orders joined with customer + ledger amount, newest first.
 * `where` is appended to the shared select — tables are aliased o (orders),
 * c (customers), t (debit transaction).
 */
export async function queryOrders(
  db: SQLite.SQLiteDatabase,
  where: string = '',
  params: SQLParams = [],
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} ${where} ORDER BY o.date DESC`,
    params
  );
}

export async function getAllOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return queryOrders(db);
}

export async function getOrdersByDateRange(
  db: SQLite.SQLiteDatabase,
  fromDate: string,
  toDate: string,
): Promise<OrderWithCustomer[]> {
  return queryOrders(db, `WHERE date(o.date) >= date(?) AND date(o.date) <= date(?)`, [fromDate, toDate]);
}

export async function getOrderWithCustomer(
  db: SQLite.SQLiteDatabase,
  orderId: number,
): Promise<OrderWithCustomer | null> {
  const rows = await queryOrders(db, `WHERE o.id = ?`, [orderId]);
  return rows[0] ?? null;
}

export async function findDuplicateOrder(
  db: SQLite.SQLiteDatabase,
  customerId: number,
  date: string,
  description: string,
): Promise<OrderWithCustomer | null> {
  const rows = await queryOrders(
    db,
    `WHERE o.customer_id = ? AND date(o.date) = date(?) AND LOWER(TRIM(o.description)) = LOWER(?)`,
    [customerId, date, description.trim()]
  );
  return rows[0] ?? null;
}

export async function getCustomersWithOrders(
  db: SQLite.SQLiteDatabase,
): Promise<{ id: number; name: string }[]> {
  return db.getAllAsync<{ id: number; name: string }>(
    `SELECT DISTINCT c.id, c.name FROM customers c
     JOIN orders o ON o.customer_id = c.id
     ORDER BY c.name ASC`
  );
}

/**
 * Bring the order's debit entry in line with the order itself.
 *
 * The ledger is the only place an order's value is kept, so every write to an
 * order ends here: the entry is created, corrected, or — once the order is
 * worth nothing — removed.
 */
async function syncOrderLedger(
  db: SQLite.SQLiteDatabase,
  orderId: number,
): Promise<void> {
  const order = await db.getFirstAsync<Order>(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  if (!order) return;
  const now = nowISO();
  const amount = orderAmount(order.quantity, order.rate);

  if (amount <= 0) {
    if (order.transaction_id !== null) {
      await db.runAsync(`DELETE FROM transactions WHERE id = ?`, [order.transaction_id]);
      await db.runAsync(`UPDATE orders SET transaction_id = NULL WHERE id = ?`, [orderId]);
    }
    return;
  }

  if (order.transaction_id !== null) {
    await db.runAsync(
      `UPDATE transactions SET amount = ?, description = ?, date = ?, updated_at = ? WHERE id = ?`,
      [amount, order.description, order.date, now, order.transaction_id]
    );
    return;
  }

  const result = await db.runAsync(
    `INSERT INTO transactions (customer_id, order_id, type, amount, description, date, created_date, updated_at)
     VALUES (?, ?, 'debit', ?, ?, ?, ?, ?)`,
    [order.customer_id, orderId, amount, order.description, order.date, now, now]
  );
  await db.runAsync(
    `UPDATE orders SET transaction_id = ? WHERE id = ?`,
    [result.lastInsertRowId, orderId]
  );
}

export async function addOrder(
  db: SQLite.SQLiteDatabase,
  customer_id: number,
  description: string,
  quantity: number = 0,
  rate: number = 0,
  date?: string,
): Promise<number> {
  const now = nowISO();
  let orderId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO orders (customer_id, description, quantity, rate, date, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customer_id, description.trim(), quantity, rate, date ?? now, now]
    );
    orderId = result.lastInsertRowId;
    await syncOrderLedger(db, orderId);
  });
  return orderId;
}

export async function bulkAddOrders(
  db: SQLite.SQLiteDatabase,
  orders: { customer_id: number; quantity: number }[],
  description: string,
  rate: number,
  date: string,
): Promise<number> {
  const now = nowISO();
  let count = 0;
  await db.withTransactionAsync(async () => {
    for (const o of orders) {
      if (o.quantity <= 0) continue;
      const result = await db.runAsync(
        `INSERT INTO orders (customer_id, description, quantity, rate, date, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [o.customer_id, description.trim(), o.quantity, rate, date, now]
      );
      await syncOrderLedger(db, result.lastInsertRowId);
      count++;
    }
  });
  return count;
}

/** The order as the lock sees it: its day, and any override on it. */
async function getOrderLockState(
  db: SQLite.SQLiteDatabase,
  orderId: number,
): Promise<{ date: string; locked: LockFlag } | null> {
  return db.getFirstAsync<{ date: string; locked: LockFlag }>(
    `SELECT date, locked FROM orders WHERE id = ?`,
    [orderId]
  );
}

export async function isOrderLocked(
  db: SQLite.SQLiteDatabase,
  orderId: number,
): Promise<boolean> {
  const row = await getOrderLockState(db, orderId);
  return row ? isLocked(row.date, row.locked) : false;
}

/**
 * Hold an order open (`false`) or shut (`true`) regardless of its date. Its
 * ledger entry follows, so the sale is not half-editable.
 */
export async function setOrderLock(
  db: SQLite.SQLiteDatabase,
  orderId: number,
  locked: boolean,
): Promise<void> {
  const now = nowISO();
  const flag = locked ? 1 : 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE orders SET locked = ?, updated_at = ? WHERE id = ?`, [flag, now, orderId]);
    await db.runAsync(
      `UPDATE transactions SET locked = ?, updated_at = ? WHERE order_id = ?`,
      [flag, now, orderId]
    );
  });
}

export async function updateOrder(
  db: SQLite.SQLiteDatabase,
  orderId: number,
  description: string,
  quantity: number = 0,
  rate: number = 0,
  date?: string,
): Promise<void> {
  const now = nowISO();
  const lock = await getOrderLockState(db, orderId);
  if (lock && isLocked(lock.date, lock.locked)) throw new LockedRecordError();
  await db.withTransactionAsync(async () => {
    const params = date
      ? [description.trim(), quantity, rate, now, date, orderId]
      : [description.trim(), quantity, rate, now, orderId];
    await db.runAsync(
      `UPDATE orders SET description = ?, quantity = ?, rate = ?, updated_at = ?${date ? ', date = ?' : ''} WHERE id = ?`,
      params
    );
    await syncOrderLedger(db, orderId);
  });
}

export async function deleteOrder(
  db: SQLite.SQLiteDatabase,
  id: number,
): Promise<void> {
  const lock = await getOrderLockState(db, id);
  if (lock && isLocked(lock.date, lock.locked)) throw new LockedRecordError();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM transactions WHERE order_id = ?`, [id]);
    await db.runAsync(`DELETE FROM orders WHERE id = ?`, [id]);
  });
}
