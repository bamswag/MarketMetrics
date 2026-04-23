# Frontend Notes

This folder contains the React frontend for MarketMetrics.

It is built with:

- React
- TypeScript
- Vite
- React Router

## What the frontend currently includes

- landing page
- login page
- signup page
- dashboard
- instrument detail pages
- tracked symbols page
- account page
- settings page

## Running the frontend

From this folder:

```bash
npm install
npm run dev
```

The dev server usually starts at:
[http://127.0.0.1:5173](http://127.0.0.1:5173)

## Build

```bash
npm run build
```

## Notes

- During development, the frontend defaults to `http://127.0.0.1:8000`.
- In production, the frontend falls back to the current site origin so a full-stack Render deployment can talk to its co-hosted API without an extra env override.
- `frontend/.env.development` currently points local frontend development at the deployed test backend, `https://marketmetrics.onrender.com`.
- If you intentionally want localhost to talk to a remote backend, set `VITE_API_BASE_URL` and also set `VITE_ALLOW_REMOTE_API_IN_DEV=true`.
- The live site is `https://marketmetrics.dev`.
- The local frontend/full-stack test origin used for backend CORS is `http://127.0.0.1:8000`.
- Never put backend secrets in frontend env files. Vite only exposes `VITE_*` values, and those should be treated as public client configuration.

## Environment

Local development against the deployed test backend:

```text
VITE_API_BASE_URL=https://marketmetrics.onrender.com
VITE_ALLOW_REMOTE_API_IN_DEV=true
```

If a different backend is needed, change `VITE_API_BASE_URL` to that backend origin. When using the deployed backend from a local frontend origin, make sure the backend has the local origin listed in `ADDITIONAL_FRONTEND_ORIGINS`.

## Main folders

- `src/app`
  app shell and routing
- `src/components`
  reusable UI components
- `src/pages`
  page-level views
- `src/lib`
  API helpers and shared frontend utilities

## General approach

The frontend is meant to feel like a market dashboard rather than a generic template. Most of the work here has been around:

- building clean page flows
- surfacing backend features more clearly
- keeping the UI simple enough to explain
- making instrument and tracked-symbol workflows easy to follow
