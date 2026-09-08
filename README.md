# BOZZ

BOZZ is an operations and inventory management system that unifies
point-of-sale (POS) transactions and marketplace order fulfillment into a
single workflow — covering product & inventory management, POS sales,
marketplace order synchronization, product mapping, packing tickets, stock
deduction, a business dashboard, and sales reporting.

## Overview

A retail business that sells both in-store (POS) and through online
marketplaces typically has to manage inventory across disconnected systems.
BOZZ addresses that by giving both channels one shared product catalog and
one shared stock ledger: a marketplace order and a walk-in POS sale both flow
through the same stock deduction and audit-trail logic, and both are visible
together in the same Dashboard and Sales Report.

## Key Features

All features below are implemented and covered by automated tests in the
current source code (verified against `backend/src/modules/` and
`apps/pwa/src/pages/`, not aspirational):

- Authentication & role-based access control (Owner, Kasir/Cashier, Pengepak/Packer)
- Product & category management, with Excel (`.xlsx`) bulk import
- Inventory management with a low-stock threshold per product
- Stock adjustment & append-only stock ledger (full audit trail)
- POS transactions — checkout, receipt, and void with automatic stock restoration
- Marketplace order synchronization (live FakeStore API integration; mock
  Shopee/TikTok/Tokopedia adapters for demo purposes)
- External product mapping (marketplace listing → internal BOZZ product)
- Order management ("Pesanan Masuk" / Incoming Orders) with a status workflow
- Ticket-based packing workflow (assign → pack → hand over)
- Automatic stock deduction on ticket handover, for mapped products
- Owner dashboard (today's sales, low stock, ticket status, recent stock activity)
- Sales report — combined POS + marketplace revenue, daily trend, top
  products, CSV export, and Excel export
- Offline-capable POS (IndexedDB via Dexie, installable PWA)

## System Architecture

```
                    ┌──────────────────┐
                    │   React PWA      │
                    │   (apps/pwa)     │
                    └────────┬─────────┘
                             │ HTTP API — contracts/api.yaml
                             ▼
                    ┌──────────────────┐
                    │ Express Backend  │
                    │ (backend/)       │
                    └────────┬─────────┘
                             │
                  ┌──────────┼──────────┐
                  ▼          ▼          ▼
             Products      Orders     Tickets
                  │          │          │
                  └──────────┼──────────┘
                             ▼
                       Stock Ledger
                             │
                             ▼
                        PostgreSQL
```

Marketplace orders and POS sales converge on the same stock ledger through
different paths (order → mapping → ticket → handover → deduction, vs. direct
checkout deduction). See [`docs/architecture.md`](docs/architecture.md) for
the full flow diagram and per-module responsibilities, and
[`docs/erd.md`](docs/erd.md) for the data model.

## Technology Stack

**Frontend**
- React 19, TypeScript, Vite
- Tailwind CSS
- React Router
- Dexie (IndexedDB) + vite-plugin-pwa (offline support)

**Backend**
- Node.js, Express, TypeScript
- Prisma ORM
- Zod (validation)
- JWT (`jsonwebtoken`) + bcryptjs (authentication)
- ExcelJS (product import / report export)
- Multer (file upload)
- Swagger UI (interactive API docs)

**Database**
- PostgreSQL

**Testing**
- Jest + Supertest, against an isolated Docker PostgreSQL instance (backend)
- Vitest + Testing Library (frontend)

**Deployment**
- Backend: Vercel (serverless) or a standalone Node process
- Database: Supabase PostgreSQL (deployment/demo only — see below)

## Project Structure

```
BOZZ/
├── apps/
│   └── pwa/                  # React PWA frontend (independent npm project)
│       ├── src/
│       └── .env.example
│
├── backend/                  # Express API backend (independent npm project)
│   ├── src/                  #   modules: auth-product, sales-inventory,
│   │                         #   ecommerce-sync, dashboard, reports
│   ├── prisma/                #   schema.prisma + migrations/
│   ├── scripts/               #   DB seed & one-off maintenance scripts
│   ├── test/                  #   Jest test suites
│   └── .env.example
│
├── contracts/                 # API and event contracts
│   ├── api.yaml               #   OpenAPI spec (source of truth for the HTTP API)
│   ├── events/                #   internal event JSON schemas
│   └── postman/                #   Postman collections
│
├── docs/                       # Technical documentation
│   ├── architecture.md
│   └── erd.md
│
├── docker-compose.yml          # Local PostgreSQL for development/testing
├── COPYRIGHT.md
└── README.md
```

`backend/` and `apps/pwa/` are **two independent npm projects** (each with
its own `package.json` and lockfile) — this is not an npm/pnpm workspace, so
each is installed and run separately.

## Prerequisites

*Tested environment* (the versions this project was actually developed and
verified against — not a hard minimum requirement):

- Node.js 22.x
- npm 10.x
- Docker 29.x + Docker Compose (for local PostgreSQL)

## Installation & Setup

Real credentials are never committed to this repository — every step below
uses either a local Docker database or a `.env.example` placeholder file.
Follow the steps in order.

**1. Clone the repository**

```bash
git clone <repository-url>
cd BOZZ
```

**2. Install backend dependencies**

```bash
cd backend
npm install
```

This also runs `prisma generate` automatically (the `postinstall` script) —
no database connection is needed for this step.

**3. Install frontend dependencies**

```bash
cd apps/pwa
npm install
```

**4. Start a local PostgreSQL database (Docker)**

From the repository root:

```bash
docker compose up -d postgres
```

This starts PostgreSQL in a container, reachable at `localhost:5433`. No
Supabase account or credentials are needed for local development.

**5. Configure the backend environment**

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and set:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/pos_platform"
DIRECT_URL="postgresql://postgres:postgres@localhost:5433/pos_platform"
JWT_SECRET=any-string-for-local-development
```

Everything else in `backend/.env.example` (marketplace credentials,
`TOKEN_ENCRYPTION_KEY`) can be left blank for local development — the
marketplace adapters run in mock mode by default, and the FakeStore
integration needs no credentials at all.

> The `.env` file is not included in this repository because it may contain
> sensitive configuration. Use `.env.example` as the template for your local
> configuration.

**6. Run database migrations**

```bash
cd backend
npx prisma migrate deploy
```

Optional — seed sample data (an owner account, test accounts, and a small
product catalog):

```bash
npx prisma db execute --file scripts/seed-owner.sql
npx prisma db execute --file scripts/seed-test-users.sql
npx prisma db execute --file scripts/seed-sales-inventory.sql
```

(These are the same commands `npm run test:db:prepare` runs — see
`backend/package.json`.)

**7. Configure the frontend environment**

```bash
cd apps/pwa
cp .env.example .env
```

The default value is already correct for local development:

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

**8. Run the backend**

```bash
cd backend
npm run dev
```

Starts at `http://localhost:3000`.

**9. Run the frontend**

```bash
cd apps/pwa
npm run dev
```

Starts at `http://localhost:5173`. Open this URL in a browser to use the
application.

## Testing

**Backend**

```bash
cd backend
npm test
```

> Backend tests use an isolated PostgreSQL database running in Docker
> (`docker compose up -d postgres`, see [Installation & Setup](#installation--setup))
> and **must not** be pointed at the Supabase database. This is enforced in
> code — `backend/src/shared/testDbSafety.ts` refuses to run any test if
> `DATABASE_URL` does not point at the expected local Docker database.

**Frontend**

```bash
cd apps/pwa
npm test
```

Runs the Vitest suite — no backend or database connection required.

## Demo Account

Use this account to log in and evaluate the application (either on the
[live deployment](#deployment) or a locally seeded instance — see
[Installation & Setup](#installation--setup), step 6):

```text
Role:     Owner
Username: owner
Password: owner123
```

This is an **application-level demo account only** — it does not grant
access to any infrastructure (Supabase, Vercel, or any other third-party
service). It is created by `backend/scripts/seed-owner.sql` and is intended
to be changed after first login in any non-demo environment.

## API Documentation

The HTTP API contract is the source of truth for every backend endpoint:

- **OpenAPI spec**: [`contracts/api.yaml`](contracts/api.yaml)
- **Interactive Swagger UI**: `GET /api/docs` on a running backend instance
  (e.g. `http://localhost:3000/api/docs`)
- **Postman collections**: [`contracts/postman/`](contracts/postman/)
- **Internal event contracts**: [`contracts/events/`](contracts/events/)
  (JSON schemas for the internal event bus, e.g. stock updates, order status
  changes)

## Technical Documentation

- [`docs/architecture.md`](docs/architecture.md) — module responsibilities,
  the marketplace order flow, timezone handling, and test isolation
- [`docs/erd.md`](docs/erd.md) — entity relationship diagram for the core
  data model (Mermaid), sourced directly from `backend/prisma/schema.prisma`

## Deployment

- **Backend**: configured for Vercel (`backend/vercel.json`,
  `backend/api/index.ts`) as a serverless Express function.
- **Database**: Supabase PostgreSQL, used only for the deployed/demo
  environment — not required for local development or testing.
- Live deployment URL: [https://bozz-system.vercel.app/login](https://bozz-system.vercel.app/login)

## Security Notice

Sensitive environment variables, API keys, database credentials, and
production secrets are not included in this repository. Please configure the
application using the provided `.env.example` files.

## Copyright

See [`COPYRIGHT.md`](COPYRIGHT.md).
