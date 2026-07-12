import * as SQLite from 'expo-sqlite';

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

export const ORDER_SELECT = `
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
    `${ORDER_SELECT} WHERE o.date >= date('now', '-6 days') ORDER BY o.date DESC`
  );
}

export async function getTomorrowOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} WHERE date(o.date) = date('now','localtime','+1 day') ORDER BY o.date DESC`
  );
}

export async function getTodayOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} WHERE date(o.date) = date('now','localtime') ORDER BY o.date DESC`
  );
}

export async function getYesterdayOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} WHERE date(o.date) = date('now','localtime','-1 day') ORDER BY o.date DESC`
  );
}

export async function getThisWeekOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} WHERE o.date >= date('now','localtime','weekday 0','-7 days') ORDER BY o.date DESC`
  );
}

export async function getThisMonthOrdersWithCustomer(
  db: SQLite.SQLiteDatabase,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} WHERE strftime('%Y-%m', o.date) = strftime('%Y-%m', 'now','localtime') ORDER BY o.date DESC`
  );
}

export async function getOrdersByDateRange(
  db: SQLite.SQLiteDatabase,
  fromDate: string,
  toDate: string,
): Promise<OrderWithCustomer[]> {
  return db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} WHERE date(o.date) >= date(?) AND date(o.date) <= date(?) ORDER BY o.date DESC`,
    [fromDate, toDate]
  );
}

export async function findDuplicateOrder(
  db: SQLite.SQLiteDatabase,
  customerId: number,
  date: string,
  description: string,
): Promise<OrderWithCustomer | null> {
  const rows = await db.getAllAsync<OrderWithCustomer>(
    `${ORDER_SELECT} WHERE o.customer_id = ? AND date(o.date) = date(?) AND LOWER(TRIM(o.description)) = LOWER(?) LIMIT 1`,
    [customerId, date, description.trim()]
  );
  return rows.length > 0 ? rows[0] : null;
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
  const now = new Date().toISOString();
  const orderDate = date ?? now;
  const result = await db.runAsync(
    `INSERT INTO orders (customer_id, amount, description, quantity, date, updated_at)
     VALUES (?, 0, ?, ?, ?, ?)`,
    [customer_id, description.trim(), quantity, orderDate, now]
  );
  return result.lastInsertRowId;
}

export async function bulkAddOrders(
  db: SQLite.SQLiteDatabase,
  orders: { customer_id: number; quantity: number }[],
  description: string,
  date: string,
): Promise<number> {
  const now = new Date().toISOString();
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
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    // Block update if order is already billed
    const order = await db.getFirstAsync<{ transaction_id: number | null }>(
      `SELECT transaction_id FROM orders WHERE id = ?`,
      [orderId]
    );
    if (order?.transaction_id !== null && order?.transaction_id !== undefined) {
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
