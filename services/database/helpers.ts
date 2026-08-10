/** Current timestamp in the ISO 8601 format used by every table. */
export const nowISO = () => new Date().toISOString();

/**
 * The calendar day an instant falls on *here*, as `YYYY-MM-DD`.
 *
 * Dates are stored as UTC instants but always shown to the user in local time,
 * so "has this day passed?" has to be asked in local time too — otherwise an
 * order made late in the evening would still count as today's until morning.
 */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Ledger balance (debits minus credits) for a transactions table aliased as `t`. */
export const LEDGER_BALANCE = `SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE -t.amount END)`;

/** Bind-parameter list accepted by the query helpers. */
export type SQLParams = (string | number | null)[];

/**
 * A record's lock override: 1 forces it locked, 0 forces it open, and null —
 * the default — leaves it to the date.
 */
export type LockFlag = number | null;

/**
 * Orders and ledger entries close themselves once their day is over, so the
 * books for a past day cannot drift after the fact. The override is what the
 * unlock action writes, and it wins in both directions.
 */
export function isLocked(date: string, locked: LockFlag): boolean {
  if (locked === 1) return true;
  if (locked === 0) return false;
  return localDayKey(new Date(date)) < localDayKey(new Date());
}

/** Thrown instead of writing to a record the lock is holding shut. */
export class LockedRecordError extends Error {
  constructor() {
    super('This record is locked');
    this.name = 'LockedRecordError';
  }
}
