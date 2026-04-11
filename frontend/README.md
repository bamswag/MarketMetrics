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

- The frontend expects the FastAPI backend to be running.
- By default it points to `http://127.0.0.1:8000`.
- You can override the backend URL with `VITE_API_BASE_URL`.

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
