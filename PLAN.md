# MFC App — Project Plan

## Overview
A local-first, offline Android mobile app for a single user to manage customers,
record orders, and share text-based invoices directly to a customer's WhatsApp.

---

## File Structure
```
mfc-app/
├── app/
│   ├── _layout.tsx            ← Root layout: SQLiteProvider + Stack navigator
│   ├── add-customer.tsx       ← Stack screen: Add new customer form
│   ├── add-order.tsx          ← Stack screen: Add new order form
│   └── (tabs)/
│       ├── _layout.tsx        ← Tab bar layout (3 tabs)
│       ├── index.tsx          ← Tab 1: Customers list
│       ├── orders.tsx         ← Tab 2: Orders list & filtering
│       └── backup.tsx         ← Tab 3: JSON backup & share
├── services/
│   └── database.ts            ← SQLite CRUD service
├── utils/
│   ├── whatsapp.ts            ← WhatsApp deep-link + invoice formatter
│   └── backup.ts              ← JSON backup + expo-sharing
└── constants/
    └── theme.ts               ← Shared colors, font sizes, spacing
```

---

## Database Schema (expo-sqlite)

### Table: `customers`
| Column         | Type    | Notes                          |
|---------------|---------|--------------------------------|
| id            | INTEGER | PRIMARY KEY AUTOINCREMENT      |
| name          | TEXT    | Customer full name             |
| place         | TEXT    | Town/city                      |
| phone_number  | TEXT    | WhatsApp number (intl format)  |
| created_date  | TEXT    | ISO 8601 (e.g. 2026-02-26)     |
| status        | TEXT    | DEFAULT 'active' or 'deleted'  |

### Table: `orders`
| Column       | Type    | Notes                          |
|-------------|---------|--------------------------------|
| id          | INTEGER | PRIMARY KEY AUTOINCREMENT      |
| customer_id | INTEGER | FK → customers.id              |
| amount      | REAL    | Order total                    |
| description | TEXT    | Item/order description         |
| date        | TEXT    | ISO 8601                       |

Foreign key enforcement: `PRAGMA foreign_keys = ON`

---

## Navigation & UI Flow

```
Stack Root
├── (tabs)
│   ├── [index]   Customers   → FlatList of active customers
│   │                           FAB → /add-customer
│   ├── orders    Orders      → FlatList with All / Past 6 Days filter
│   │                           Each order card has a WhatsApp button
│   └── backup    Backup      → "Create Backup" button → share sheet
├── add-customer  (modal)     → Name / Place / Phone form
└── add-order     (modal)     → Customer picker + Amount + Description
```

---

## Key Implementation Notes

1. **SQLiteProvider** wraps the entire app in `app/_layout.tsx` so every
   screen can call `useSQLiteContext()` to get the DB handle.

2. **Foreign keys** are enabled via `PRAGMA foreign_keys = ON` inside `onInit`.

3. **Past 6 Days filter** uses `date('now', '-6 days')` in SQLite directly,
   JOINing orders with customers to show the customer name.

4. **WhatsApp deep link** format:
   `whatsapp://send?phone=<E.164>&text=<encoded invoice>`

5. **Backup** dumps both tables to a single JSON object, writes it to
   `FileSystem.cacheDirectory`, then invokes `Sharing.shareAsync()`.

6. **UI design**: large text (min 18sp), high-contrast colours, generous
   padding — optimised for an older user on a mid-size Android phone.
