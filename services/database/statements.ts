import * as SQLite from 'expo-sqlite';
import { nowISO } from './helpers';

export interface Statement {
  id: number;
  customer_id: number;
  from_date: string;
  to_date: string;
  total_debit: number;
  total_credit: number;
  balance: number;
  sent_via: string;
  created_date: string;
  updated_at: string;
}

export interface StatementTransaction {
  id: number;
  statement_id: number;
  transaction_id: number;
}

export async function insertStatement(
  db: SQLite.SQLiteDatabase,
  customerId: number, transactionIds: number[],
  totalDebit: number, totalCredit: number, balance: number,
  fromDate: string, sentVia: string = 'whatsapp',
): Promise<number> {
  const now = nowISO();
  let statementId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO statements (customer_id, from_date, to_date, total_debit, total_credit, balance, sent_via, created_date, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
