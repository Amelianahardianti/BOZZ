# BOZZ PWA — Frontend

React + TypeScript + Vite Progressive Web App frontend for BOZZ. See the
[root README](../../README.md) for the full project overview, architecture,
and backend setup — this file only covers running the frontend on its own.

## Requirements

- Node.js 22+ (tested environment — see root README)
- npm 10+
- The BOZZ backend running (see [`../../backend`](../../backend)), or any
  API base URL that implements [`contracts/api.yaml`](../../contracts/api.yaml)

## Installation

```bash
npm install
```

## Environment Variables

```bash
cp .env.example .env
```

Only one variable is used:

| Variable | Purpose | Default (`.env.example`) |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL of the backend API (must include `/api`) | `http://localhost:3000/api` |

No secrets are required on the frontend — Vite environment variables are
bundled into the client build and are never treated as confidential by this
project.

## Run Development Server

```bash
npm run dev
```

Starts Vite's dev server, by default at `http://localhost:5173`.

## Build

```bash
npm run build
```

Type-checks the project (`tsc -b`) and produces a production build in `dist/`.

```bash
npm run preview
```

Serves the production build locally for a final check.

## Testing

```bash
npm test
```

Runs the Vitest suite (component/unit tests, Testing Library) — no backend
or database connection required.

## Lint

```bash
npm run lint
```
