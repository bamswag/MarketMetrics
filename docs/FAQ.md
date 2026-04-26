# MarketMetrics FAQ

## What is MarketMetrics?

MarketMetrics is a full-stack educational financial investment assistant built as a final-year Computer Science project. It brings together market search, instrument charts, watchlists, price alerts, historical investment simulations, short-term forecasts, and long-term growth projections in one web app.

It is not a trading platform and does not give financial advice.

---

## What does the project currently support?

- Email/password registration and login
- Google login and sign-up
- Password reset and email verification flows
- Account profile, password, notification preference, logout-all-sessions, and risk-profile management
- Stock, ETF, and crypto search
- Instrument detail pages with historical charts, quote metadata, and similar instruments
- Watchlist / tracked-symbol management
- Price alerts with `above`, `below`, `percent_change`, and `range_exit` conditions
- Alert history, bulk actions, browser notifications, in-app toasts, and near-real-time quote checks via WebSocket
- Daily top gainers and losers
- Featured mover card for day/week/month and asset-type filters
- Historical investment simulations (buy-and-hold vs dollar-cost averaging)
- Short-term forecast page (Random Forest model)
- Long-term growth projection page with deterministic scenarios and Monte Carlo output
- Projection history saved for signed-in users
- Admin pages for user management (`/admin/users`) and audit logs (`/admin/audit-logs`)

---

## What is the difference between simulation, forecast, and projection?

**Simulation** looks backward. You pick a date range, an initial amount, and optionally a recurring contribution. The simulator runs buy-and-hold and dollar-cost averaging strategies over that historical data and compares the outcomes.

**Forecasting** looks at the short term. A trained Random Forest model estimates near-future price movement based on historical patterns. The output is an analytical estimate — not a guarantee.

**Projection** looks years ahead. You set assumptions (expected return, volatility, inflation), a time horizon, and recurring contributions. The engine runs deterministic pessimistic/baseline/optimistic scenarios and a Monte Carlo simulation to show the range of plausible outcomes.

The three are intentionally separate because they serve different questions.

---

## Is MarketMetrics a trading platform?

No. The app is for market monitoring, research, and educational scenario planning. There is no order placement or brokerage integration. Forecasts and projections are analytical estimates for educational purposes and should not be treated as financial advice.

---

## Where does market data come from?

All market data comes from Alpaca via the IEX feed. This includes:

- Live quotes and snapshots
- Historical daily bars (OHLCV)
- Top movers
- Asset metadata

Crypto symbols are stored without slashes internally (e.g. `BTCUSD`) but formatted as `BTC/USD` for Alpaca API calls.

The app uses a locally cached symbol catalog (from Alpaca) for search, asset classification, and market-category display.

---

## How does live alert monitoring work?

When a signed-in user has active alerts, the frontend opens a WebSocket connection for each active symbol. The backend polls Alpaca every 30 seconds, evaluates the active alerts against the latest price, logs any triggers to the `alert_events` table, and sends `alert_triggered` messages back to the browser.

The frontend deduplicates recent triggers, refreshes alert and watchlist data, shows toast notifications, and can request browser notification permission.

Important: alerts are only evaluated while an active browser session has a WebSocket connection open for the relevant symbol. There is no background monitoring process that runs independently when no user session is open. This is a known limitation.

---

## How does the WebSocket quote streaming work?

The WebSocket connections use polling under the hood — the backend wakes up every 30 seconds, fetches a quote from Alpaca, and sends it to the browser if the price has changed. It is not a true exchange-level streaming feed.

Connections are capped at 30 minutes. If Alpaca has transient errors, the backend backs off (5s → 15s → 30s) and closes the connection after three consecutive failures. Error messages sent to the browser are generic; detailed errors are in the server logs.

---

## What happened to simulation history?

The `POST /simulate/` route still exists and returns a side-by-side buy-and-hold vs DCA comparison for signed-in users. The `simulation_history` table was reworked to store long-term growth projection runs rather than short-term simulations. The projection route saves history automatically when a valid user token is present.

---

## Are forecast and projection available to logged-out users?

The backend routes are public:

- `POST /predict/forecast`
- `POST /project/long-term`

The frontend routes are also public in the router, but the current frontend API helpers still require a login token before sending the requests. This means logged-out users cannot currently run forecasts or projections from the frontend.

If logged-out access is enabled in the frontend in the future, rate limiting should be added first because these routes are more computationally expensive than ordinary page loads.

---

## What does the forecasting model use?

The forecast pipeline uses a Random Forest model trained on historical daily bars. Features include price movement, engineered return indicators, and benchmark context. The model outputs a short-term directional estimate with a confidence interval.

Model artifacts must exist in `artifacts/prediction/` before the forecast route can work. On Render, these artifacts do not persist across redeploys — see the deployment notes for details.

Forecasts are analytical estimates, not financial predictions.

---

## Why is long-term projection separate from short-term forecasting?

A short-term forecasting model is not a sensible tool for estimating 10 or 30-year outcomes. Long-term projection is built around compound growth assumptions, recurring contribution schedules, inflation-adjusted values, and probability distributions from Monte Carlo simulation. The two tools address completely different planning questions, so they are kept as separate features.

---

## What are the alert condition types?

- `above`: triggers when the live price reaches or exceeds `targetPrice`.
- `below`: triggers when the live price reaches or falls below `targetPrice`.
- `percent_change`: triggers when absolute movement from `referencePrice` reaches the percentage threshold stored in `targetPrice`.
- `range_exit`: triggers when the price moves below `lowerBound` or above `upperBound`.

Each condition type has specific field requirements validated by Pydantic on the backend. Triggered alerts are deactivated, logged to `alert_events`, and can be reset via the bulk action endpoint.

---

## Who can access the admin pages?

Admin access is controlled by the `isAdmin` field on the user record. Normal users cannot self-promote to admin. Admin accounts must be provisioned manually by updating the database directly.

The admin pages are:

- `/admin/users` — view and manage registered users
- `/admin/audit-logs` — view audit events

For assessment purposes, an admin account is available at `admin@marketmetrics.dev` (password: `password123`).

---

## How is caching handled?

The backend keeps bounded, short-lived in-memory caches for:
- Quotes (max 300 symbols, 120-second TTL)
- Historical close series and bar data
- Movers (45-second TTL)
- Featured movers (45-second TTL for day, 300-second for week/month)

The frontend also caches dashboard data, instrument details, public quotes, and featured movers with short TTLs and in-flight request deduplication where useful.

These caches are per-process and not distributed. They exist mainly to reduce Alpaca API call frequency and keep Render memory usage bounded.

---

## How do I run the backend tests?

```bash
PYTHONPATH=.:tests .venv/bin/python -m unittest discover -s tests -v
```

Currently 99 tests pass. The suite covers auth, alerts, watchlists, simulations, projections, forecasting, instruments, movers, search, WebSocket behaviour, and SQLite schema compatibility.

There is no automated frontend test suite at the moment.

---

## Where is MarketMetrics deployed?

- Live website: `https://marketmetrics.dev`
- Deployed test backend: `https://marketmetrics.onrender.com`
- Local FastAPI / full-stack origin: `http://127.0.0.1:8000`
- Vite dev server: `http://127.0.0.1:5173`

---

## What are the main limitations?

- No frontend automated test suite. Backend tests exist (99 passing), but there is no Jest/Vitest/RTL coverage for React components.
- No CI/CD pipeline. Deploys are triggered manually.
- No API rate limiting on any route. This should be addressed before promoting public access to forecast and projection routes.
- Alerts only evaluate during active browser sessions — there is no offline background monitoring.
- WebSocket quotes are polling-backed (30-second ticks), not true streaming.
- Forecast artifacts do not persist across Render redeploys without additional storage.
- Simulations do not model tax, transaction costs, FX conversion, or dividend treatment.
- Forecasts and projections are educational tools, not financial advice.
- All market data depends on Alpaca. If a symbol is not in the Alpaca catalog or feed limits apply, that data will not be available.

---

## What is the simplest way to describe the project?

MarketMetrics is an educational financial monitoring and investment-assistance platform that combines live market data, watchlists, price alerts, historical simulations, short-term forecasts, and long-term growth projections in one full-stack web app. It was built as a final-year Computer Science project and is not intended for real investment decisions.
