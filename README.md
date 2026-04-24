# MarketMetrics

MarketMetrics is a full-stack market monitoring app. It combines instrument search, live market data, charts, tracked symbols, price alerts, daily movers, short-term forecasts, and long-term growth projections in one workspace.

The backend is a FastAPI app with SQLAlchemy, Alembic, Alpaca market data, Brevo transactional email, Google OAuth, and PostgreSQL on Render. The frontend is a React/Vite app served at `https://marketmetrics.dev`.

## What It Does

- Search stocks, ETFs, and crypto by symbol or company name.
- Open instrument pages with quote data, historical charts, similar instruments, forecast links, projection links, watchlist controls, and alert creation.
- Track symbols in a signed-in dashboard shortlist.
- Create and manage price alerts, including `above`, `below`, `percent_change`, and `range_exit` alerts.
- Stream live quote checks through WebSockets for active alert symbols.
- View top gainers and losers across stocks, crypto, and ETFs.
- Run short-term forecasts from trained Random Forest artifacts.
- Run long-term growth projections with deterministic scenarios and Monte Carlo output.
- Manage account profile, password, email verification, notification preferences, Google identity, and risk profile.

## Tech Stack

Backend:

- Python 3.9+
- FastAPI
- SQLAlchemy
- Alembic
- Pydantic v2
- SQLite for local development
- PostgreSQL on Render
- Alpaca market data
- Brevo transactional email
- Google OAuth
- pandas, numpy, scikit-learn, joblib

Frontend:

- React 19
- TypeScript
- Vite 8
- React Router 7
- Recharts 3

## Project Structure

- `app/api/routes`
  FastAPI HTTP and WebSocket routes.
- `app/services`
  Backend business logic for auth, alerts, watchlists, search, instruments, quotes, simulations, projection history, and market overview.
- `app/integrations/alpaca`
  Alpaca client, asset lookup, and market-data fetch helpers.
- `app/forecasting`
  Training, feature engineering, artifact loading, and forecast inference.
- `app/projections`
  Long-term projection assumptions, deterministic scenarios, and Monte Carlo engine.
- `app/orm_models`
  SQLAlchemy database models.
- `app/schemas`
  Pydantic request/response schemas.
- `frontend/src/app`
  Router, auth state, dashboard data loading, WebSocket alert orchestration, and app shell.
- `frontend/src/components`
  Reusable UI modules, dashboard cards, movers cards, alerts panel, charts, search, and insight cards.
- `frontend/src/pages`
  Page-level React views.
- `frontend/src/styles`
  Component and page styles.
- `migrations/versions`
  Alembic schema history.
- `tests`
  Backend unittest coverage.
- `docs`
  Supporting documentation.

## Running Locally

### Backend

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and fill in the values needed for your run.
4. Apply migrations:

```bash
alembic upgrade head
```

5. Start the backend:

```bash
uvicorn app.main:app --reload
```

The API runs at [http://127.0.0.1:8000](http://127.0.0.1:8000). Swagger docs are available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

If `frontend/dist` exists, FastAPI also serves the built React app and falls back to `index.html` for frontend routes.

### Frontend

From `frontend`:

```bash
npm install
npm run dev
```

The Vite dev server defaults to [http://127.0.0.1:5173](http://127.0.0.1:5173).

The frontend API origin is controlled by `VITE_API_BASE_URL`. In development, the frontend falls back to `http://127.0.0.1:8000` unless a safe remote API override is enabled.

## Deployment

Current Render setup:

- Live website: `https://marketmetrics.dev`
- Deployed test backend: `https://marketmetrics.onrender.com`
- Local full-stack/FastAPI-served frontend origin: `http://127.0.0.1:8000`
- Vite development origin: `http://127.0.0.1:5173`

The backend uses PostgreSQL on Render, Alpaca for market data, Brevo for transactional emails, and Google OAuth for Google login/sign-up. More deployment detail lives in [docs/DEPLOYMENT.md](/Users/ayoba/PycharmProjects/MarketMetrics/docs/DEPLOYMENT.md).

## Important Environment Variables

Backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `FRONTEND_BASE_URL`
- `ADDITIONAL_FRONTEND_ORIGINS`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `BREVO_API_KEY`
- `BREVO_TRANSACTIONAL_EMAIL_URL`
- `BREVO_TIMEOUT_SECONDS`
- `EMAIL_FROM_NAME`
- `EMAIL_FROM_ADDRESS`
- `ALPACA_API_KEY`
- `ALPACA_SECRET_KEY`
- `ALPACA_DATA_FEED`
- `ALPACA_DATA_BASE_URL`
- `ALPACA_TRADING_BASE_URL`
- `SYMBOL_CATALOG_PATH`
- `PREDICTION_MODEL_DIR`
- `PREDICTION_TRAINING_LOOKBACK_DAYS`
- `PREDICTION_FETCH_CONCURRENCY`
- `PREDICTION_TRAINING_UNIVERSE`
- `PREDICTION_TRAINING_UNIVERSE_PATH`
- `MARKET_DATA_DEFAULT_HISTORY_DAYS`
- `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES`
- `EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES`
- `APP_LOG_LEVEL`

Frontend:

- `VITE_API_BASE_URL`
- `VITE_ALLOW_REMOTE_API_IN_DEV`

Do not put backend secrets, database URLs, Alpaca keys, Brevo keys, Google client secrets, or JWT secrets in frontend env files.

For live deployment, `FRONTEND_BASE_URL` should include the scheme:

```text
FRONTEND_BASE_URL=https://marketmetrics.dev
```

For the deployed test backend, Google OAuth should callback to:

```text
GOOGLE_OAUTH_REDIRECT_URI=https://marketmetrics.onrender.com/auth/google/callback
```

For local frontend testing against the deployed backend, include local origins in `ADDITIONAL_FRONTEND_ORIGINS`, for example:

```text
ADDITIONAL_FRONTEND_ORIGINS=http://127.0.0.1:8000,http://127.0.0.1:5173,http://localhost:5173
```

## API Areas

- `GET /health`
- `/auth`
- `/search/companies`
- `/quotes`
- `/movers`
- `/movers/featured`
- `/instruments/{symbol}`
- `/instruments/similar/{symbol}`
- `/watchlist`
- `/alerts`
- `/alerts/history`
- `/alerts/{id}/history`
- `/alerts/bulk`
- `/simulate`
- `/simulate/history`
- `/predict/forecast`
- `/project/long-term`
- `WS /ws/quotes/{symbol}`

Most account, watchlist, alert, simulation history, and dashboard operations require JWT auth. `forecast` and `long-term projection` backend routes are public in FastAPI, but the current frontend helpers still require a token before calling them.

## Data Model

Main tables:

- `users`
  Account identity, provider state, password access, Google subject, pending email changes, password reset tokens, session versioning, email notification preference, risk profile, and timestamps.
- `watchlist_items`
  Saved symbols per user with a unique `(userID, symbol)` constraint.
- `price_alerts`
  Alert rules for `above`, `below`, `percent_change`, and `range_exit`.
- `alert_events`
  Trigger history for fired alerts.
- `simulation_history`
  Saved long-term growth projection runs, including projection parameters, end values, growth, probability of profit, notes, and timestamps.

## Forecasting

Train or refresh a forecasting model with:

```bash
python scripts/train_stock_model.py
```

Common optional flags:

- `--symbols AAPL MSFT NVDA`
- `--version rf_demo`
- `--lookback-days 1825`

Artifacts are written under `PREDICTION_MODEL_DIR` and selected through `artifacts/prediction/latest.json`. Forecast inference lazy-loads the ML stack so normal web traffic does not load pandas, scikit-learn, or model artifacts into memory unless the forecast route is used.

Forecasts are experimental and should not be treated as financial advice.

## Symbol Catalog

Refresh the local symbol catalog from Alpaca with:

```bash
python scripts/sync_symbol_catalog.py
```

Search, market-category display, movers grouping, quote eligibility, and asset-class handling all depend on the local symbol catalog.

## Caching And Memory Notes

The app uses bounded, short-lived caches in both backend and frontend code:

- Backend quote cache: `app/services/quotes.py`, max 300 symbols, hard TTL 120 seconds.
- Backend daily close cache: `app/services/price_history.py`, max 48 entries, hard TTL 300 seconds.
- Backend bar-history cache: max 32 entries, hard TTL 300 seconds.
- Backend earliest-date cache: max 96 entries, hard TTL 6 hours.
- Backend movers cache: max 4 limit-specific entries, TTL 45 seconds.
- Backend featured mover cache: max 8 entries, TTL 45 seconds for day and 300 seconds for week/month.
- Frontend dashboard cache: 30 seconds per token.
- Frontend instrument detail cache: 60 seconds, max 40 entries, with in-flight deduplication.
- Frontend public quote cache: 30 seconds, max 300 symbols.
- Frontend featured mover cache: 60 seconds.

These limits matter on Render because the web process has finite memory. Historical chart data and ML dependencies are the most important areas to keep bounded.

## Useful Commands

Apply migrations:

```bash
alembic upgrade head
```

Create a migration:

```bash
alembic revision -m "describe change"
```

Run backend tests:

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
```

Build frontend:

```bash
cd frontend
npm run build
```

Run frontend lint:

```bash
cd frontend
npm run lint
```

## Known Risks And Care Points

- The backend currently exposes `/predict/forecast` and `/project/long-term` publicly, while the frontend helper still gates them behind login. If logged-out access is enabled in the frontend, add rate limiting and abuse controls first.
- Alpaca availability, market hours, symbol support, and feed limits can affect quotes, charts, movers, forecasts, and projections.
- Crypto symbols are stored like `BTCUSD`, but Alpaca data calls expect slash-pair formatting such as `BTC/USD`.
- `FRONTEND_BASE_URL` must include `https://` in deployment or email links and OAuth redirects can be malformed.
- Google OAuth uses a signed state token carrying `returnTo`, `intent`, `acceptedTerms`, and `frontendOrigin`; local origins must be explicitly allowed.
- Brevo sends password reset and pending-email verification links. If `BREVO_API_KEY` is missing, the backend logs the email action instead of sending.
- `sessionVersion` invalidates old JWTs after password changes and "logout all sessions".
- Forecast artifacts must exist before `/predict/forecast` can return a forecast.
- Long-term projection is separate from short-term forecasting; projection outputs are scenario estimates, not model predictions or financial advice.
