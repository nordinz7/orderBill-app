import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

/**
 * The customer a list is narrowed to. The name is carried alongside the id
 * because the two tabs offer different customers to choose from — one lists
 * whoever has an order, the other whoever appears in the ledger — so the tab
 * being switched to may not have the chosen customer in its own list and would
 * otherwise have no name to put on the chip.
 */
export interface FilterCustomer {
  id: string;
  name: string;
}

interface ListFilterValue {
  /** Null means every date. */
  date: Date | null;
  setDate: (date: Date | null) => void;
  /** Null means every customer. */
  customer: FilterCustomer | null;
  setCustomer: (customer: FilterCustomer | null) => void;
}

const ListFilterContext = createContext<ListFilterValue | null>(null);

/**
 * The date and customer the Orders and Transactions tabs are both looking
 * through.
 *
 * They are two views of the same day's business, so narrowing one and finding
 * the other still showing everything means setting the same filter twice. The
 * filters live here instead, above both tabs, and carry across when the tab
 * changes.
 *
 * Deliberately not persisted: a filter is about the session in front of you,
 * and reopening the app tomorrow on yesterday's date would be worse than
 * starting on today's.
 */
export function ListFilterProvider({ children }: { children: ReactNode }) {
  const [date, setDateState] = useState<Date | null>(() => new Date());
  const [customer, setCustomerState] = useState<FilterCustomer | null>(null);

  const setDate = useCallback((next: Date | null) => setDateState(next), []);
  const setCustomer = useCallback((next: FilterCustomer | null) => setCustomerState(next), []);

  const value = useMemo(
    () => ({ date, setDate, customer, setCustomer }),
    [date, setDate, customer, setCustomer],
  );

  return <ListFilterContext.Provider value={value}>{children}</ListFilterContext.Provider>;
}

export function useListFilter(): ListFilterValue {
  const ctx = useContext(ListFilterContext);
  if (!ctx) throw new Error('useListFilter must be used inside ListFilterProvider');
  return ctx;
}
