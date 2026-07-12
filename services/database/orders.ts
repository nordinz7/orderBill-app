import * as SQLite from 'expo-sqlite';
import { nowISO, SQLParams } from './helpers';

export interface Order {
  id: number;
  customer_id: number;
  description: string;
  quantity: number;
  transaction_id: number | null;
  bill_id: number | null;
  date: string;
  updated_at: string;
}

export interface OrderWithCustomer extends Order {
  customer_name: string;
  customer_place: string;
  customer_phone: string;
  billed_amount: number;
}

const ORDER_SELECT = `
  SELECT
    o.*,
    COALESCE(t.amount, 0) AS billed_amount,
    c.name         AS customer_name,
    c.place        AS customer_place,
    c.phone_number AS customer_phone
  FROM orders o
  JOIN customers c ON o.customer_id = c.id
  LEFT JOIN transactions t ON t.order_id = o.id AND t.type = 'debit'
`;

/**
 * Query orders joined with customer + billed amount, newest first.
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

export async function getRecentOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return queryOrders(db, `WHERE o.date >= date('now', '-6 days')`);
}

export async function getTomorrowOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return queryOrders(db, `WHERE date(o.date) = date('now','localtime','+1 day')`);
}

export async function getTodayOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return queryOrders(db, `WHERE date(o.date) = date('now','localtime')`);
}

export async function getYesterdayOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return queryOrders(db, `WHERE date(o.date) = date('now','localtime','-1 day')`);
}

export async function getThisWeekOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return queryOrders(db, `WHERE o.date >= date('now','localtime','weekday 0','-7 days')`);
}

export async function getThisMonthOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return queryOrders(db, `WHERE strftime('%Y-%m', o.date) = strftime('%Y-%m', 'now','localtime')`);
}

export async function getOrdersByDateRange(
  db: SQLite.SQLiteDatabase,
  fromDate: string,
  toDate: string,
): Promise<OrderWithCustomer[]> {
  return queryOrders(db, `WHERE date(o.date) >= date(?) AND date(o.date) <= date(?)`, [fromDate, toDate]);
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

export async function getDistinctOrderDates(
  db: SQLite.SQLiteDatabase,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ d: string }>(
    `SELECT DISTINCT date(date) as d FROM orders ORDER BY d DESC LIMIT 60`
  );
  return rows.map(r => r.d);
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

export async function addOrder(
  db: SQLite.SQLiteDatabase,
  customer_id: number,
  description: string,
  quantity: number = 0,
  date?: string,
): Promise<number> {
  const now = nowISO();
  const result = await db.runAsync(
    `INSERT INTO orders (customer_id, amount, description, quantity, date, updated_at)
     VALUES (?, 0, ?, ?, ?, ?)`,
    [customer_id, description.trim(), quantity, date ?? now, now]
  );
  return result.lastInsertRowId;
}

export async function bulkAddOrders(
  db: SQLite.SQLiteDatabase,
  orders: { customer_id: number; quantity: number }[],
  description: string,
  date: string,
): Promise<number> {
  const now = nowISO();
  let count = 0;
  await db.withTransactionAsync(async () => {
    for (const o of orders) {
      if (o.quantity <= 0) continue;
      await db.runAsync(
        `INSERT INTO orders (customer_id, amount, description, quantity, date, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [o.customer_id, 0, description.trim(), o.quantity, date, now]
      );
      count++;
    }
  });
  return count;
}

export async function isOrderBilled(
  db: SQLite.SQLiteDatabase,
  orderId: number,
): Promise<boolean> {
  const row = await db.getFirstAsync<{ transaction_id: number | null }>(
    `SELECT transaction_id FROM orders WHERE id = ?`,
    [orderId]
  );
  return row?.transaction_id !== null && row?.transaction_id !== undefined;
}

export async function updateOrder(
  db: SQLite.SQLiteDatabase,
  orderId: number,
  description: string,
  quantity: number = 0,
  date?: string,
): Promise<void> {
  const now = nowISO();
  await db.withTransactionAsync(async () => {
    // Block update if order is already billed
    if (await isOrderBilled(db, orderId)) {
      throw new Error('Cannot edit a billed order');
    }
    const params = date
      ? [description.trim(), quantity, now, date, orderId]
      : [description.trim(), quantity, now, orderId];
    await db.runAsync(
      `UPDATE orders SET description = ?, quantity = ?, updated_at = ?${date ? ', date = ?' : ''} WHERE id = ?`,
      params
    );
  });
}

export async function deleteOrder(
  db: SQLite.SQLiteDatabase,
  id: number,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM transactions WHERE order_id = ?`, [id]);
    await db.runAsync(`DELETE FROM orders WHERE id = ?`, [id]);
  });
}
