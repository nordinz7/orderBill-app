# orderBill

A local-first, offline-only Android app for food business owners to manage customers, record orders/payments, track balances, and share invoices & statements via WhatsApp.

![Expo](https://img.shields.io/badge/Expo-54-000020?logo=expo)
![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)
![Platform](https://img.shields.io/badge/Platform-Android-3DDC84?logo=android)
![License](https://img.shields.io/badge/License-Private-red)

## Features

- **Customer Management** — Add, edit, bulk-import from phone contacts
- **Order Tracking** — Single & bulk orders with quantity × rate, date & customer filters
- **Payment Recording** — Multiple payment methods, bulk payments
- **Transactions** — One ledger of orders, payments received & debts, filtered by date and customer
- **Locking** — Orders and ledger entries close themselves once their day has passed, and can be unlocked
- **Invoices & Statements** — Beautiful templates with ViewShot capture
- **Payment Receipts** — Shareable receipt images
- **WhatsApp Integration** — Send invoices, statements & receipts directly
- **Reports** — Daily summaries, outstanding balances
- **Offline-First** — All data stored locally in SQLite, no internet required
- **Bilingual** — English & Tamil language support
- **Theming** — Light & dark mode with system preference detection
- **Configurable** — Currency symbol, company details, default order description

## Tech Stack

| Layer     | Technology                                    |
| --------- | --------------------------------------------- |
| Framework | Expo SDK 54, React Native 0.81                |
| Language  | TypeScript (strict mode)                      |
| Rendering | React 19 with React Compiler                  |
| Routing   | Expo Router (file-based)                      |
| Database  | expo-sqlite (WAL mode, foreign keys)          |
| State     | React Context + AsyncStorage                  |
| Styling   | StyleSheet.create with theme tokens           |
| Sharing   | ViewShot + expo-sharing + WhatsApp deep links |

## Getting Started

### Prerequisites

- Node.js 20.19.4 (see [.nvmrc](.nvmrc))
- Android Studio (for emulator/local builds)
- EAS CLI (`npm install -g eas-cli`)

### Install & Run

```bash
nvm use
npm install
npm run dev          # Start Expo dev server
```

### Build

```bash
npm run build:apk          # EAS cloud build (APK preview)
npm run build:apk:local    # EAS local build (APK)
npm run build:aab          # EAS cloud build (production AAB)
```

### Lint

```bash
npm run lint
```

## Project Structure

```
app/
  _layout.tsx              Root layout (SettingsProvider > SQLiteProvider > Stack)
  (tabs)/
    _layout.tsx            Bottom tabs
    index.tsx              Customers list
    orders.tsx             Orders with date/customer filters
    transactions.tsx       Ledger: orders, payments received, debts
    settings.tsx           App settings
  add-customer.tsx         Add customer modal
  add-order.tsx            Add single order modal
  edit-order.tsx           Edit order (read-only while locked)
  bulk-orders.tsx          Bulk order entry
  add-payment.tsx          Record payment modal
  bulk-payments.tsx        Bulk payment entry
  customer-detail.tsx      Customer profile & transaction history
  view-invoice.tsx         Quick invoice sharing
  view-statement.tsx       Account statement
  view-payment-receipt.tsx Payment receipt
  reports.tsx              Daily summaries & outstanding balances

components/
  InvoiceBill.tsx          Invoice template
  StatementBill.tsx        Statement template
  StatementExporter.tsx    Bulk statement image export
  PaymentReceipt.tsx       Payment receipt template
  DateStrip.tsx            Horizontal date picker

contexts/
  SettingsContext.tsx       Theme, language, company info, currency

services/
  database/                Schema, migrations & all SQLite CRUD
    schema.ts              Table creation + migrations
    orders.ts              Orders and the debit entries they own
    payments.ts            Ledger entries & balances
    helpers.ts             Shared SQL fragments, locking rules

constants/
  theme.ts                 Color tokens, spacing, typography
  translations.ts          en/ta translations

utils/
  whatsapp.ts              WhatsApp deep links & image sharing
  imageExport.ts           Saving statement images to a chosen folder
  filenames.ts             Filename sanitising (keeps non-Latin scripts intact)
  backup.ts                JSON export/import
```

## Database Schema

| Table          | Purpose                                                 |
| -------------- | ------------------------------------------------------- |
| `customers`    | Customer profiles (name, place, phone)                  |
| `orders`       | What was sold (description, quantity, rate, date)       |
| `transactions` | Double-entry ledger (debit/credit) — where amounts live |

Every order owns exactly one debit entry, created with the order and kept in step
with it. An amount is never stored twice.

## Configuration

All settings are persisted to AsyncStorage and accessible via `useSettings()`:

| Setting            | Default    | Description                  |
| ------------------ | ---------- | ---------------------------- |
| Theme              | System     | Light/dark mode              |
| Language           | English    | `en` or `ta`                 |
| Currency Symbol    | `$`        | Configurable in settings     |
| Company Name       | My Company | Shown on invoices/statements |
| Country Code       | +91        | Phone number prefix          |
| Default Order Desc | Order      | Pre-filled order description |

## Release Workflow

```bash
# 1. Bump version in app.json (version + versionCode)
# 2. Commit & tag
git commit -m "release: v0.0.2"
git tag v0.0.2
git push origin main --tags

# 3. Build production AAB
npm run build:aab

# 4. Submit to Play Store
eas submit --platform android
```

Version scheme: `0.0.x` (dev) > `0.1.0` (testing) > `1.0.0` (production)
