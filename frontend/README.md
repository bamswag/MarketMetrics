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
- `frontend/.env.development` keeps local dev pinned to `http://127.0.0.1:8000`.
- If you intentionally want localhost to talk to a remote backend, set `VITE_API_BASE_URL` and also set `VITE_ALLOW_REMOTE_API_IN_DEV=true`.

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
