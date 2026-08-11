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

/**
 * The half-open instant range `[start, end)` covering the local calendar days
 * `from`..`to` inclusive, both given as `YYYY-MM-DD`.
 *
 * Every filter in the app is a local day, but dates are stored as UTC instants,
 * so the two have to be reconciled somewhere. Asking SQLite for `date(t.date)`
 * asks the question in UTC, which east of Greenwich drops everything recorded
 * after local afternoon; turning the day into its true local start and end
 * does not.
 */
export function localDayBounds(from: string, to: string): [string, string] {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return [
    new Date(fy, fm - 1, fd).toISOString(),
    new Date(ty, tm - 1, td + 1).toISOString(),
  ];
}

/** Parse a `YYYY-MM-DD` day key as local midnight — `new Date(key)` reads it as UTC. */
export function parseLocalDay(key: string): Date | null {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
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
