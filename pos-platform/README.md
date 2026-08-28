# POS PWA Multi-Platform (v2 Flock Stock Track)

Monorepo: 1 backend Express (modular monolith) + 1 frontend PWA, terhubung
lewat kontrak `contracts/api.yaml`.

## Struktur
- `contracts/` — kontrak REST (`api.yaml`) dan event internal (`events/`)
- `backend/` — Express + TypeScript, 3 modul: sales-inventory (Orang A),
  ecommerce-sync (Orang B), auth-product (Orang C)
- `apps/pwa/` — frontend PWA (React + Vite), dikerjakan Orang C

## Setup awal
Lihat instruksi step-by-step yang menyertai repo ini.
