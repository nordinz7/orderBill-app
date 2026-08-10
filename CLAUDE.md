# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MFC App is a local-first, offline-only Android mobile app for a food business owner to manage customers, record orders/payments, track balances, and share invoices/statements via WhatsApp. Built with Expo (SDK 54) and React Native 0.81, using React 19 with the React Compiler enabled.

## Commands

```bash
npm run dev              # Start Expo dev server (with --go flag)
npm run lint             # ESLint (expo lint)
npm run build:apk        # EAS cloud build (APK preview)
npm run build:apk:local  # EAS local build (APK)
npm run build:aab        # EAS cloud build (production AAB)
```

There is no test framework configured.

## Architecture

### Routing (Expo Router — file-based)

```
app/_layout.tsx              → Root: SettingsProvider > SQLiteProvider > Stack
app/(tabs)/_layout.tsx       → Bottom tabs: Orders, Transactions, Customers, Settings
app/(tabs)/index.tsx         → Customers list
app/(tabs)/orders.tsx        → Orders list with date filters
app/(tabs)/transactions.tsx  → Ledger: orders, payments received, debts (date + customer filters)
app/(tabs)/settings.tsx      → Theme, language, company details
app/(tabs)/backup.tsx        → Backup/restore (hidden from tab bar, accessed via settings)
app/add-customer.tsx         → Modal: add customer
app/edit-customer.tsx        → Modal: edit customer
app/add-order.tsx            → Modal: add single order (quantity + amount)
app/edit-order.tsx           → Modal: edit order (read-only while locked)
app/bulk-orders.tsx          → Modal: add orders to multiple customers at once
app/add-payment.tsx          → Modal: record payment
app/bulk-payments.tsx        → Modal: record payments for multiple customers
app/customer-detail.tsx      → Stack screen: customer profile, orders, balance
app/view-statement.tsx       → Stack screen: account statement
app/preview-statement.tsx    → Stack screen: statement preview with StatementBill
app/view-invoice.tsx         → Stack screen: quick invoice sharing
app/view-payment-receipt.tsx → Stack screen: payment receipt sharing
app/reports.tsx              → Modal: daily summaries, outstanding balances
app/developer.tsx            → Modal: DB stats, raw SQL query tool
```

### Data Layer

- **Database**: `expo-sqlite` with WAL mode and foreign keys enabled. All CRUD lives in `services/database.ts`. The DB is named `mfc.db` and initialized via `initDatabase()` passed to `<SQLiteProvider onInit>`.
- **Schema**: 3 tables — `customers`, `orders` (what was sold: description, quantity, date), `transactions` (double-entry ledger with debit/credit types). Every order owns exactly one debit entry, created and kept in step by `syncOrderLedger` in `services/database/orders.ts`; the ledger is the only place an amount is stored — an order row carries no amount of its own, and the per-unit rate shown in the UI is derived from it (`unitRate`). Migrations use `ALTER TABLE` wrapped in try-catch for idempotency, and retired tables/columns are dropped the same way — all of it safe to re-run on every launch. A one-time pass over existing *rows* goes behind the `PRAGMA user_version` check in `schema.ts` (bump `SCHEMA_VERSION`), so it cannot undo choices the user made afterwards. Row backfills must never touch `transactions`: balances have to come out of an upgrade unchanged.
- **Types**: All DB row interfaces (`Customer`, `Order`, `Transaction`, `CustomerWithBalance`, `OrderWithCustomer`, `TransactionWithCustomer`, etc.) are exported from `services/database`.
- **Locking**: Orders and ledger entries lock themselves once their day has passed (`isLocked` in `services/database/helpers.ts`, compared in local time). The `locked` column overrides that in either direction — `setOrderLock` / `setTransactionLock` write it, and both keep an order and its debit entry in agreement. Writes to a locked record throw `LockedRecordError`.
- **No remote API** — everything is local SQLite + AsyncStorage.

### State Management

- **ListFilterContext** (`contexts/ListFilterContext.tsx`): the date and customer the Orders and Transactions tabs are both filtered by. Mounted in `app/(tabs)/_layout.tsx` so the filter survives switching tabs; in memory only, never persisted.
- **SettingsContext** (`contexts/SettingsContext.tsx`): provides theme (`isDark`, `colors`), language (`lang`, `tr`), and company info. Persisted to AsyncStorage under `@mfc_*` keys.
- **Database access**: screens call `useSQLiteContext()` directly and invoke functions from `services/database.ts`.

### Styling

All components use `StyleSheet.create()` via a `makeStyles(colors: AppColors)` factory pattern. Theme tokens (colors, font sizes, spacing, radii) are defined in `constants/theme.ts`. No CSS-in-JS library.

### Localization

Two languages: English (`en`) and Tamil (`ta`), defined in `constants/translations.ts`. The `Lang` type is `'en' | 'ta'`. Dynamic strings use function interpolation (e.g., `removeCustomerMsg: (name: string) => \`...\``). Access translations via `useSettings().tr`.

### Shared Components

- **DateStrip** (`components/DateStrip.tsx`): horizontal scrollable date picker (±180 days)
- **InvoiceBill** (`components/InvoiceBill.tsx`): itemized invoice template, single or multi-order, bilingual
- **PaymentReceipt** (`components/PaymentReceipt.tsx`): payment receipt template with ViewShot integration
- **StatementBill** (`components/StatementBill.tsx`): account statement template with running balance

### External Integrations

- **WhatsApp** (`utils/whatsapp.ts`): deep-links for sending invoices, bills, receipts, and statements via `whatsapp://send?phone=...&text=...`. Image sharing via ViewShot capture.
- **Backup** (`utils/backup.ts`): JSON export/import of all tables, with local backup management and Google Drive sharing via `expo-sharing`
- **Contacts** (`expo-contacts`): bulk import phone contacts as customers with duplicate detection

## Conventions

- TypeScript strict mode with path alias `@/*` mapping to project root
- All components are functional, using hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useFocusEffect`)
- Dates stored as ISO 8601 strings in SQLite
- Filenames for exported/shared images go through `sanitizeSegment` (`utils/filenames.ts`), which keeps non-Latin scripts intact
- UI optimized for large text and high contrast (target user: older, mid-size Android phone)
