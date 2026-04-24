# MarketMetrics FAQ

## What is MarketMetrics?

MarketMetrics is a full-stack market monitoring app. It brings together market search, instrument charts, tracked symbols, alerts, daily movers, forecasts, and long-term projections in one workspace.

## What does the project currently support?

- Email/password registration and login
- Google login and Google sign-up
- Password reset and pending-email verification
- Account profile, password, notification preference, logout-all-sessions, and risk-profile management
- Stock, ETF, and crypto search
- Instrument detail pages with historical charts and quote metadata
- Similar-instrument discovery
- Watchlist/tracked-symbol workflows
- Price alerts with `above`, `below`, `percent_change`, and `range_exit` conditions
- Alert history, bulk alert actions, browser notifications, in-app toasts, and WebSocket quote checks
- Daily top gainers and losers
- Featured mover card for day/week/month and asset filters
- Short-term forecast page
- Long-term growth projection page with Monte Carlo output
- Projection history saved for signed-in users

## What is the difference between simulation, forecast, and projection?

Simulation looks backward and answers what would have happened under a historical strategy.

Forecasting looks at the short term and estimates near-future price movement from trained model artifacts.

Projection looks years ahead and uses assumptions, deterministic scenarios, contributions, inflation settings, and Monte Carlo output.

The code keeps these separate because they solve different problems.

## What happened to simulation history?

`POST /simulate/` still exists and returns historical buy-and-hold/DCA comparison output for signed-in users, but the `simulation_history` table has been reworked to store long-term growth projection runs. The projection route saves history when a valid user token is present.

## Are forecast and projection available to logged-out users?

The backend routes are currently public:

- `POST /predict/forecast`
- `POST /project/long-term`

The frontend routes are also public, but the current frontend API helpers still require a token before sending those requests. If logged-out usage is enabled in the frontend, add rate limits and abuse controls first because forecasts and projections can be more expensive than ordinary page loads.

## What does the forecasting model use?

The forecast pipeline uses tabular machine learning rather than deep learning. It includes historical daily bars, engineered price/return features, benchmark context, date-aware validation, interval output, model metadata, and saved artifacts under `artifacts/prediction`.

The app explains Random Forest, MAE, forecast limitations, and projection differences through static insight cards on the landing page and dashboard.

## Why is long-term projection separate from forecasting?

A short-term forecasting model is not a good tool for estimating a 10-year or 30-year outcome. Long-term projection is built around planning assumptions, deterministic scenarios, recurring contributions, inflation-aware values, and Monte Carlo ranges.

## What are price alert types?

- `above`: triggers when the live price reaches or exceeds `targetPrice`.
- `below`: triggers when the live price reaches or falls below `targetPrice`.
- `percent_change`: triggers when absolute movement from `referencePrice` reaches the percentage threshold in `targetPrice`.
- `range_exit`: triggers when price moves below `lowerBound` or above `upperBound`.

Triggered alerts are deactivated, logged to `alert_events`, surfaced through WebSocket messages, and can be reset.

## How does live alert monitoring work?

When a signed-in user has active alerts, the frontend opens WebSocket connections for the active symbols. The backend sends quote messages, evaluates active alerts against the latest price, logs trigger events, and sends `alert_triggered` messages back to the browser. The frontend deduplicates recent triggers, refreshes alert/watchlist data, shows toasts, and can request browser notification permission.

## Where does market data come from?

Market data comes from Alpaca. The app uses Alpaca snapshots, bars, top movers, and asset metadata through helpers in `app/integrations/alpaca`.

Crypto symbols are stored without slashes in app flows, such as `BTCUSD`, but Alpaca data calls may require pair formatting such as `BTC/USD`.

## Why are there generated files in `artifacts/`?

`artifacts/` stores generated forecasting outputs such as trained models, metadata, evaluation files, plots, and the `latest.json` pointer. These are generated pipeline outputs, not hand-written application code.

## Why is the repo split into routes, services, schemas, and models?

- `api/routes` exposes HTTP and WebSocket entry points.
- `services` contains reusable backend logic.
- `schemas` defines request/response shapes.
- `orm_models` defines database tables.
- `integrations` isolates provider-specific code.

That split keeps the system easier to test, document, and extend.

## How is caching handled?

The backend uses bounded caches for quotes, historical close series, bar series, earliest-available dates, movers, and featured movers. The frontend also caches dashboard data, featured movers, public quotes, and instrument details. These caches are intentionally bounded because Render memory is finite and historical market data can get large quickly.

## Where is MarketMetrics deployed?

- Live website: `https://marketmetrics.dev`
- Deployed test backend: `https://marketmetrics.onrender.com`
- Local full-stack/FastAPI origin: `http://127.0.0.1:8000`
- Vite dev server: `http://127.0.0.1:5173`

## Which Render env values matter most?

- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_BASE_URL`
- `ADDITIONAL_FRONTEND_ORIGINS`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `BREVO_API_KEY`
- `EMAIL_FROM_ADDRESS`
- `ALPACA_API_KEY`
- `ALPACA_SECRET_KEY`
- `PREDICTION_MODEL_DIR`

For live links and Google redirects, `FRONTEND_BASE_URL` should be `https://marketmetrics.dev`.

## Why does `ADDITIONAL_FRONTEND_ORIGINS` matter?

The backend uses it for CORS and Google OAuth frontend-origin validation. If a local frontend talks to the deployed backend, the local origin must be listed.

Example:

```text
http://127.0.0.1:8000,http://127.0.0.1:5173,http://localhost:5173
```

## What is the simplest way to describe the project?

MarketMetrics is a market monitoring and analysis platform that combines live market context, watchlists, alerts, short-term forecasts, and long-term growth projections in one full-stack app.

## What are the main limitations?

- Forecasting and projections are experimental and not financial advice.
- Market data depends on Alpaca availability, supported symbols, market hours, and feed limits.
- Public forecast/projection access needs rate limiting before it is heavily promoted.
- Render memory needs to be protected with bounded caches and lazy ML loading.
- The app is a research and monitoring tool, not a trading platform.
