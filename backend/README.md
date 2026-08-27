# Shopee Order PoC — Backend

Fondasi project (Step 3A). Belum ada implementasi Shopee API, authentication, order, atau frontend.

## Requirements

- Node.js 18+
- npm

## Install dependency

```bash
npm install
```

## Setup .env

Copy `.env.example` menjadi `.env`, lalu isi `PORT` (nilai lain masih placeholder, belum dipakai di tahap ini):

```bash
cp .env.example .env
```

## Migration database

```bash
npx prisma migrate dev --name init
```

Perintah ini membuat file SQLite di `prisma/dev.db` sesuai `DATABASE_URL` di `.env`. Schema masih kosong (belum ada model) — ini disengaja untuk Step 3A.

## Menjalankan server

```bash
npm run dev
```

Server berjalan di `http://localhost:3000` (atau sesuai `PORT` di `.env`).

## Testing /api/health

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{ "status": "ok" }
```
