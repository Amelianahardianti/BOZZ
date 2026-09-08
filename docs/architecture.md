# BOZZ — System Architecture

This document describes the actual implemented architecture of BOZZ, verified
directly against the source code (not a design proposal). It complements the
API contract at [`contracts/api.yaml`](../contracts/api.yaml).

## 1. System Components

```
                    ┌──────────────────┐
                    │   React PWA      │
                    │   (apps/pwa)     │
                    └────────┬─────────┘
                             │ HTTP (JSON) — contracts/api.yaml
                             ▼
                    ┌──────────────────┐
                    │  Express Backend │
                    │  (backend/)      │
                    └────────┬─────────┘
                             │ Prisma ORM
                             ▼
                    ┌──────────────────┐
                    │   PostgreSQL     │
                    └──────────────────┘
```

The frontend and backend are two independent npm projects (no shared
workspace) that communicate exclusively over the HTTP API described in
`contracts/api.yaml`. The frontend additionally uses IndexedDB (via Dexie) on
the client for offline-capable POS usage — this is local browser storage, not
a separate backend service.

## 2. Backend Modules

The backend is a modular monolith (single Express app, single database) split
into five modules under `backend/src/modules/`, registered independently in
`backend/src/app.ts`. Responsibilities below were confirmed against each
module's actual routes, not assumed from folder names:

| Module | Responsibility |
|---|---|
| `auth-product` | Login/logout/session (`/auth/*`), staff account management (`/staff/*`), store settings, notifications (source present, not wired into the current MVP navigation) |
| `sales-inventory` | Product & category CRUD, product Excel import, stock adjustments & stock ledger, marketplace product mapping (`/products/:id/mappings`), POS transactions (checkout/void), ticket packing workflow |
| `ecommerce-sync` | Marketplace platform connections, order ingestion & normalization, webhooks, customer records, and a demo order injector (`/dev/inject-order`) used for live demos |
| `dashboard` | Single read-only aggregation endpoint (`/dashboard`) summarizing products, today's POS sales, marketplace orders, ticket status, and recent stock activity |
| `reports` | Read-only sales report endpoint (`/reports/sales`) combining POS and marketplace revenue over a date range, plus Excel export |

`dashboard` and `reports` are intentionally read-only aggregation layers: they
query across the other modules' tables but never write to them.

## 3. Marketplace Order Flow

This is the core cross-cutting flow that ties the marketplace integration to
the POS/inventory system, verified against the actual implementation
(`ecommerce-sync` → `sales-inventory`):

```
External Platform (FakeStore API, or mock Shopee/TikTok/Tokopedia)
        │
        ▼
Platform Adapter (backend/src/modules/ecommerce-sync/adapters/)
        │  normalizes each platform's payload into a common shape
        ▼
External Order + External Order Items  (external_orders / external_order_items)
        │
        ▼
Product Resolution (channel_listings mapping, falling back to SKU match)
        │  an order item may remain unmapped (product_id = null) if the
        │  external item was never mapped to a BOZZ product
        ▼
Ticket created for the order, assigned to a Pengepak (packer)
        │
        ▼
Packing (ticket items checked off)
        │
        ▼
Handed Over (ticket status → handed_over)
        │
        ▼
Automatic Stock Deduction (only for items with a resolved product_id)
        │
        ▼
Stock Adjustment Ledger entry (reason: external_order)
```

The POS side is a simpler parallel path: a completed transaction directly
deducts stock and writes a ledger entry (`reason: sale`); a void restores it
(`reason: void_reversal`). Both paths converge on the same `stock_adjustments`
ledger table, which is what `dashboard` and `reports` read from.

## 4. Timezone Handling

"Today" / date-range boundaries (used by the Dashboard, Sales Report, and
transaction date filters) are computed from the **server's local time**,
assembled from year/month/day components — never by parsing a date string as
UTC and never by relying on the database session's timezone. This is a
deliberate, previously-debugged decision: the server is expected to run with
`TZ=Asia/Jakarta`, since neither the database nor the API contract currently
carries a per-store timezone column.

## 5. Testing Isolation

Backend automated tests run against a disposable **Docker PostgreSQL**
instance (`docker-compose.yml`), never against the Supabase database used for
deployment/demo. This is enforced in code (`backend/src/shared/testDbSafety.ts`)
as a fail-closed guard that refuses to run if `DATABASE_URL` does not point at
the expected local Docker database — see [`README.md`](../README.md#testing)
for how to run it.

## 6. Deployment Shape

- **Backend**: Express app, deployable to Vercel as a serverless function
  (`backend/api/index.ts`, `backend/vercel.json`) or run as a normal Node
  process (`npm run build && npm start`).
- **Frontend**: static PWA build (`apps/pwa`, Vite), deployable to any static
  host.
- **Database**: PostgreSQL — Docker locally, Supabase for the deployed/demo
  environment. No production credentials are part of this submission; see
  the Environment Configuration section of the root README.
