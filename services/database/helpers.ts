/** Current timestamp in the ISO 8601 format used by every table. */
export const nowISO = () => new Date().toISOString();

/** Ledger balance (debits minus credits) for a transactions table aliased as `t`. */
export const LEDGER_BALANCE = `SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE -t.amount END)`;

/** Bind-parameter list accepted by the query helpers. */
export type SQLParams = (string | number | null)[];
