# Frontend Notes

This folder contains the React frontend for MarketMetrics.

It is built with:

- React 19
- TypeScript
- Vite 8
- React Router 7
- Recharts 3

## Running The Frontend

From this folder:

```bash
npm install
npm run dev
```

The dev server starts at [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Build

```bash
npm run build
```

The production build is written to `frontend/dist`. The FastAPI backend serves that folder when it exists.

## Environment

The API base URL comes from `VITE_API_BASE_URL`.

Development fallback:

```text
http://127.0.0.1:8000
```

Local development against the deployed test backend:

```text
VITE_API_BASE_URL=https://marketmetrics.onrender.com
VITE_ALLOW_REMOTE_API_IN_DEV=true
```

If `VITE_API_BASE_URL` points to a remote backend while the browser is running from a loopback host, the frontend falls back to the local API unless `VITE_ALLOW_REMOTE_API_IN_DEV=true`.

Do not put backend secrets in frontend env files. Vite exposes `VITE_*` values to the browser.

## Main Folders

- `src/app`
  Router, auth state, dashboard data loading, global 401 handling, WebSocket alert orchestration, and app shell.
- `src/components`
  Reusable UI components, dashboard cards, search, movers, alert panel, chart cards, insight cards, and navigation.
- `src/pages`
  Page-level views.
- `src/lib`
  API helpers, formatters, chart utilities, instrument display helpers, and market preferences.
- `src/styles`
  Page and component styles.

## Current Pages

Public/guest-accessible:

- Landing page
- Login page
- Signup page
- Forgot/reset password pages
- Email verification page
- Terms and privacy pages
- Search results
- Instrument detail
- Movers gainers/losers pages
- Forecast route
- Growth projection route

Signed-in:

- Dashboard
- Tracked symbols
- Account
- Settings
- Simulation/projection history

Important nuance: forecast and projection routes are public in the router, and the backend routes are public, but `fetchForecast` and `fetchGrowthProjection` currently require a token before making requests.

## Dashboard UI

The signed-in dashboard currently includes:

- `DashboardHero` with product intro copy and the user risk-profile block.
- `FeaturedMoverCard` beside the hero.
- `TrackedSymbolsPreview` showing up to four tracked symbols in a compact grid.
- Random Forest insight card below the featured mover side.
- `DailyMoversSection`, with live data and forecast/projection insight cards between gainers and losers.
- MAE and Monte Carlo insight cards between daily movers and alerts.
- Compact `AlertsPanel` with stats, notifications, bulk actions, and active/triggered/paused previews.
- Full-width responsible-use insight card.

## API Layer

`src/lib/api.ts` owns:

- API origin resolution.
- Token headers.
- JSON parsing and API error handling.
- Global session-expired event dispatch on 401.
- WebSocket URL/protocol helpers.
- Frontend caches for featured movers, public quotes, and instrument details.
- Fetch helpers for auth, movers, search, quotes, instruments, watchlists, alerts, simulations, forecast, projection, and history.

## WebSocket Alerts

`AppRouter` opens quote WebSockets for symbols with active alerts. It reconnects with backoff, deduplicates triggered alerts, refreshes dashboard alert/watchlist data, shows in-app toasts, and optionally uses browser notifications.

## Styling Notes

- Global styles live in `src/App.css` and `src/index.css`.
- Page styles live under `src/styles/pages`.
- Component styles live under `src/styles/components`.
- Shared chart tooltip shell styles live in `src/styles/components/ChartTooltip.css`.

The app is styled as a market dashboard: dense enough to scan, soft enough to feel approachable, and careful about not turning dashboard panels into oversized landing-page sections.
