# Frontend Notes

This folder contains the React frontend for MarketMetrics — an educational financial investment assistant built as a final-year Computer Science project.

Built with:

- React 19 + TypeScript
- Vite 8
- React Router 7
- Recharts 3

---

## Running the Frontend

From this folder:

```bash
npm install
npm run dev
```

The dev server starts at [http://127.0.0.1:5173](http://127.0.0.1:5173).

By default it expects a local backend at `http://127.0.0.1:8000`. To point it at the deployed test backend, create or update `.env.development`:

```text
VITE_API_BASE_URL=https://marketmetrics.onrender.com
VITE_ALLOW_REMOTE_API_IN_DEV=true
```

---

## Building for Production

```bash
npm run build
```

The output goes to `frontend/dist`. FastAPI detects that directory at startup and serves the React app and its assets. All unmatched routes fall back to `index.html` so React Router handles client-side navigation.

---

## Environment Variables

Only `VITE_*` values belong in frontend env files. Vite bakes these into the build and they are visible in the browser. Do not put backend secrets, database URLs, Alpaca keys, Brevo keys, or JWT secrets here.

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend API origin |
| `VITE_ALLOW_REMOTE_API_IN_DEV` | Set `true` to allow a remote backend in local dev mode |

---

## Folder Structure

```
src/
├─ app/           Router, auth state, dashboard data loading, WebSocket orchestration, app shell
├─ components/    Reusable UI components (cards, charts, nav, alerts, search, movers)
├─ pages/         Page-level React views
├─ lib/           API helpers, formatters, chart utils, market display, preferences
└─ styles/        Page and component CSS
```

---

## Pages

**Public / guest-accessible:**

- Landing page (`/`)
- Login (`/login`)
- Signup (`/signup`)
- Forgot password (`/forgot-password`)
- Reset password (`/reset-password/:token`)
- Email verification (`/verify-email/:token`)
- Terms and privacy (`/terms`, `/privacy`)
- Search results (`/search-results/:query`)
- Instrument detail (`/instrument/:symbol`)
- Movers gainers/losers (`/movers/gainers`, `/movers/losers`)
- Forecast (`/forecast/:symbol`)
- Growth projection (`/instrument/:symbol/project`)

Note: Forecast and projection routes are public in the router and the backend, but the current `fetchForecast` and `fetchGrowthProjection` API helpers still require a token before making requests.

**Signed-in only:**

- Dashboard (`/dashboard`)
- Tracked symbols (`/tracked-symbols`)
- Account (`/account`)
- Settings (`/settings`)
- Projection/simulation history (`/history`)

**Admin only (requires `isAdmin`):**

- User management (`/admin/users`)
- Audit logs (`/admin/audit-logs`)

---

## Dashboard Layout

The signed-in dashboard currently includes:

1. `DashboardHero` with welcome copy and risk-profile block beside `FeaturedMoverCard`.
2. `TrackedSymbolsPreview` (up to four symbols in a compact grid) beside the Random Forest insight card.
3. `DailyMoversSection` with live gainers/losers data and forecast/projection insight cards.
4. MAE and Monte Carlo insight cards between movers and alerts.
5. Compact `AlertsPanel` with stats, notification state, bulk actions, and alert previews.
6. Full-width responsible-use insight card.

---

## API Layer

`src/lib/api.ts` owns:

- API origin resolution from `VITE_API_BASE_URL` with dev safety checks.
- Token headers for authenticated requests.
- JSON parsing and `ApiError` class for HTTP errors.
- Global session-expired event dispatch on 401 responses.
- WebSocket URL and protocol builders.
- Frontend caches (featured movers, public quotes, instrument details, dashboard data) with short TTLs and in-flight deduplication.
- Fetch helpers for auth, movers, search, quotes, instruments, watchlists, alerts, simulations, forecasts, projections, history, and admin.

---

## WebSocket Alert Monitoring

`AppRouter` opens a quote WebSocket for each symbol with an active alert. It reconnects with exponential backoff on failures, deduplicates recently triggered alerts, refreshes dashboard alert and watchlist data, shows in-app toasts, and optionally uses browser notifications.

The WebSocket connections poll Alpaca every 30 seconds under the hood — they are not true exchange-level streaming connections.

---

## Styling

- Global styles: `src/App.css` and `src/index.css`.
- Page styles: `src/styles/pages/`.
- Component styles: `src/styles/components/`.
- Shared chart tooltip shell: `src/styles/components/ChartTooltip.css` (used by instrument chart, forecast, projection, and top-result chart tooltips).

---

## Testing

There is currently no automated frontend test suite. Backend tests exist (99 passing), but no Jest/Vitest/React Testing Library coverage has been written for the frontend components. This is future work.
