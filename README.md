# MarketMetrics

MarketMetrics is a full-stack educational financial investment assistant built as a final-year Computer Science project (Leicester CO3201, 2025–2026).

It lets users search for stocks, ETFs, and crypto, track instruments they care about, set up price alerts, run historical investment simulations, view short-term price forecasts, and build long-term growth projections. Everything runs in a single web app backed by a FastAPI service and a React frontend.

The project is educational. It is not a trading platform and it does not give financial advice.

Live site: **https://marketmetrics.dev**

---

## Key Features

- Search stocks, ETFs, and crypto by symbol or company name.
- Instrument detail pages with historical charts, quote data, similar instruments, and links to forecasting and projection tools.
- Watchlist for tracking symbols.
- Price alerts: `above`, `below`, `percent_change`, and `range_exit` conditions, with severity, expiration, and trigger history.
- Near-real-time quote checks via WebSocket (polling-backed, 30-second ticks).
- Daily top gainers and losers, plus a featured mover card covering day/week/month and asset-type filters.
- Historical investment simulations: buy-and-hold versus dollar-cost averaging, with performance metrics comparison.
- Short-term price forecasts from a trained Random Forest model.
- Long-term growth projections with deterministic pessimistic/baseline/optimistic scenarios and Monte Carlo simulation output.
- Projection history saved per user.
- Full account management: email/password auth, Google OAuth, password reset, email verification, notification preferences, risk profile.
- Admin pages for user management and audit log review.

---

## Technology Stack

**Backend**

- Python 3.9+
- FastAPI
- SQLAlchemy + Alembic
- Pydantic v2
- SQLite (local development)
- PostgreSQL (Render deployment)
- Argon2 password hashing
- JWT access tokens with `sessionVersion` invalidation
- Alpaca (market data: quotes, bars, snapshots, movers, asset metadata)
- Brevo (transactional email: password reset, email verification)
- Google OAuth 2.0
- pandas, numpy, scikit-learn, joblib (forecasting pipeline only, lazy-loaded)

**Frontend**

- React 19 + TypeScript
- Vite 8
- React Router 7
- Recharts 3

---

## System Architecture Summary

```
Browser (React SPA)
  └─ Vite build served by FastAPI (production) or Vite dev server (development)
  └─ HTTP requests → FastAPI routes
  └─ WebSocket connections → FastAPI WebSocket route (per-symbol quote polling)

FastAPI backend
  ├─ API routes (auth, search, quotes, instruments, watchlists, alerts, simulate, forecast, project, admin)
  ├─ Services (business logic, separated from route handlers)
  ├─ Integrations (Alpaca client, email, Google OAuth)
  ├─ Projections (assumptions derivation, deterministic engine, Monte Carlo)
  ├─ Forecasting (Random Forest artifacts, lazy-loaded inference)
  └─ ORM models + Alembic migrations → SQLite (local) / PostgreSQL (Render)
```

---

## Backend Features

**Auth and accounts**
- Email/password registration with Argon2 hashing.
- JWT login with configurable expiry and `sessionVersion` claim for session invalidation.
- Google OAuth sign-in and sign-up, with account linking.
- Password reset via email link (Brevo).
- Pending email change with verification link.
- Risk profile and email notification preferences.
- "Logout all sessions" that bumps `sessionVersion` and invalidates existing tokens.

**Market data (Alpaca)**
- All market data comes from Alpaca via IEX feed by default.
- Quotes, historical bars (OHLCV), snapshots, top movers, and asset metadata.
- Crypto symbols are stored as `BTCUSD` internally but formatted as `BTC/USD` for Alpaca API calls.

**Search and instruments**
- Fuzzy search across a locally cached symbol catalog.
- Instrument detail: historical chart data with range options (1M, 3M, 6M, 1Y, 5Y), latest quote, similar instruments.

**Watchlists**
- Signed-in users can add and remove symbols.
- Watchlist endpoint returns enriched data including latest quotes and alert counts.

**Price alerts**
- Four condition types with Pydantic validation enforcing condition-specific fields.
- Evaluated against live quote data during WebSocket connections.
- Trigger history stored in `alert_events` table.
- Bulk pause, resume, reset, and delete operations.

**WebSocket quote updates**
- One WebSocket connection per tracked symbol per browser session.
- Backend polls Alpaca every 30 seconds, evaluates alerts, sends triggered alert messages to the browser.
- Connections are capped at 30 minutes. Transient Alpaca errors use backoff (5s → 15s → 30s) up to three attempts before closing.
- This is polling-backed, not a true exchange-level streaming feed.

**Simulations**
- Historical buy-and-hold and dollar-cost averaging simulations over a user-specified date range.
- Outputs: final value, profit, total return, annualised return, volatility, max drawdown, best/worst single day.
- Both strategies are always computed for side-by-side comparison.
- Separate annualisation factors for equities (252 trading days) and crypto (365 days).
- These are educational historical simulations. They do not account for tax, FX, slippage, or transaction costs.

**Forecasting**
- Short-term Random Forest model trained on historical daily bars and engineered features.
- Forecast artifacts must be trained and present in `PREDICTION_MODEL_DIR` before the forecast route works.
- ML dependencies (pandas, scikit-learn, joblib) are lazy-loaded so normal traffic is not affected.
- Outputs are analytical estimates, not financial predictions.

**Long-term projections**
- Derives assumptions from historical data or accepts manual overrides.
- Three deterministic scenarios (pessimistic, baseline, optimistic) with configurable contributions and inflation.
- Monte Carlo simulation with configurable run count (up to 10,000).
- Projection history saved when a valid user token is present.
- These are scenario planning tools for educational use. They are not financial advice.

**Admin**
- `/admin/users` — view and manage registered user accounts.
- `/admin/audit-logs` — view system audit events.
- Access controlled by `isAdmin` flag on the user record. Normal users cannot self-promote.
- Admin accounts must be provisioned manually (see Admin Setup below).

---

## Frontend Features

- Public landing page with product introduction and insight cards.
- Login, signup, password reset, email verification, and legal pages.
- Dashboard with featured mover card, tracked symbol preview, daily movers, alerts panel, and insight cards.
- Instrument detail page with chart, quote, similar instruments, watchlist toggle, and alert creation.
- Search results page grouped by asset category (stocks, crypto, ETFs) with load-more pagination.
- Movers direction pages (gainers / losers) with sparkline cards.
- Forecast page for short-term estimates.
- Growth projection page with scenario tables and Monte Carlo chart.
- Projection/simulation history page.
- Account, settings, and tracked symbols management pages.
- Admin users and admin audit log pages.

---

## Authentication and Security

- Passwords hashed with Argon2 (using the `passlib` wrapper).
- JWTs signed with `JWT_SECRET`, configurable algorithm (HS256 default).
- `sessionVersion` claim checked on every authenticated request. Password changes and logout-all invalidate old tokens.
- Google OAuth uses a signed short-lived state token to carry `returnTo`, `intent`, `acceptedTerms`, and `frontendOrigin` through the OAuth flow.
- Two-step email change: a verification link must be clicked before the new address is committed.
- WebSocket auth via query param or `Authorization` header subprotocol.
- Sensitive data (user emails, token hashes) is not included in operational server logs.
- On Render deployments, the backend refuses to start if `JWT_SECRET` is missing or set to the default placeholder `"change-me"`.

---

## Admin Functionality

Admin pages are available at:

- `/admin/users` — user list with management options.
- `/admin/audit-logs` — audit event history.

Admin access is controlled by the `isAdmin` field on the user record. Regular users cannot grant themselves admin access. Admin accounts should be set up manually after the first deployment (see Admin Setup in `docs/DEPLOYMENT.md`).

Assessment admin account (for marker access):

- Email: `admin@marketmetrics.dev`
- Password: `password123`

---

## Project Structure

```
app/
├─ api/routes/       FastAPI HTTP and WebSocket route handlers
├─ services/         Business logic (auth, alerts, watchlists, quotes, simulations, etc.)
├─ integrations/     Provider-specific code (Alpaca client, email, Google OAuth)
├─ projections/      Long-term projection engine (assumptions, deterministic, Monte Carlo)
├─ forecasting/      ML training, feature engineering, artifact loading, inference
├─ orm_models/       SQLAlchemy database models
├─ schemas/          Pydantic request/response schemas
└─ core/             Config, database session, auth utilities, dependencies

frontend/src/
├─ app/              Router, auth state, data loading, WebSocket orchestration
├─ components/       Reusable UI components
├─ pages/            Page-level React views
├─ lib/              API helpers, formatters, market utilities
└─ styles/           Page and component CSS

migrations/versions/ Alembic migration history (9 revisions)
tests/               Backend unittest suite
docs/                Supporting documentation
scripts/             Training and symbol-catalog utilities
data/                Symbol catalog and training universe files
artifacts/           Generated forecast model artifacts
```

---

## Running Locally

### Backend

1. Create a virtual environment and activate it.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and fill in the values you need:

```bash
cp .env.example .env
```

At minimum for local development you need `JWT_SECRET`, and optionally Alpaca keys for live market data. Without Alpaca keys the market data routes will fail.

4. Apply migrations:

```bash
alembic upgrade head
```

The local dev database defaults to SQLite (`marketmetrics_dev.db`). PostgreSQL is used in production.

5. Start the backend:

```bash
uvicorn app.main:app --reload
```

API available at http://127.0.0.1:8000. Swagger docs at http://127.0.0.1:8000/docs.

If `frontend/dist` exists, FastAPI also serves the built React app and handles frontend route fallback.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite dev server starts at http://127.0.0.1:5173.

By default it points to http://127.0.0.1:8000. To point the frontend at the deployed test backend, set `frontend/.env.development`:

```text
VITE_API_BASE_URL=https://marketmetrics.onrender.com
VITE_ALLOW_REMOTE_API_IN_DEV=true
```

---

## Running Tests

The backend test suite currently has 99 passing tests. Run it with:

```bash
PYTHONPATH=.:tests .venv/bin/python -m unittest discover -s tests -v
```

Tests cover: auth (registration, login, session versioning, email verification, password reset, Google OAuth), alerts, watchlists, simulations, long-term projections, forecasting, instruments, movers, search, WebSocket behaviour, and SQLite schema compatibility.

There is currently no automated frontend test suite. Frontend testing is future work.

---

## Forecasting Model

Train or refresh the forecast model:

```bash
python scripts/train_stock_model.py
python scripts/train_stock_model.py --symbols AAPL MSFT NVDA --version rf_demo
```

Artifacts are written under `PREDICTION_MODEL_DIR` and the active version is tracked in `artifacts/prediction/latest.json`.

The forecast route will return an error if artifacts do not exist. On Render, artifacts do not persist across deploys — this is a known limitation.

## Symbol Catalog

Refresh the symbol catalog from Alpaca:

```bash
python scripts/sync_symbol_catalog.py
```

Search, movers grouping, quote eligibility, and asset-class handling all depend on this file.

---

## Important Environment Variables

**Backend (never put these in frontend files)**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required on Render) |
| `JWT_SECRET` | Must be a secure random value. The app refuses to start on Render if this is empty or `"change-me"`. |
| `JWT_ALGORITHM` | HS256 (default) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 60 (default) |
| `FRONTEND_BASE_URL` | Must include scheme, e.g. `https://marketmetrics.dev`. Used for CORS, email links, OAuth redirects. |
| `ADDITIONAL_FRONTEND_ORIGINS` | Comma-separated extra allowed origins, e.g. local dev origins |
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Backend callback URL registered in Google Cloud Console |
| `BREVO_API_KEY` | Brevo transactional email API key |
| `EMAIL_FROM_ADDRESS` | Must be a verified sender address in Brevo |
| `ALPACA_API_KEY` | Alpaca market data API key |
| `ALPACA_SECRET_KEY` | Alpaca market data secret key |
| `ALPACA_DATA_FEED` | `iex` (default) |
| `SYMBOL_CATALOG_PATH` | Path to local symbol catalog JSON |
| `PREDICTION_MODEL_DIR` | Path to forecast artifact directory |
| `MARKET_DATA_DEFAULT_HISTORY_DAYS` | 3650 (default, 10 years) |
| `APP_LOG_LEVEL` | `INFO` (default) |

**Frontend (only `VITE_*` values, these are public)**

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend API origin |
| `VITE_ALLOW_REMOTE_API_IN_DEV` | Set `true` to allow remote backend in local dev |

---

## API Overview

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Health check |
| POST | `/auth/register` | No | Register account |
| POST | `/auth/login` | No | Login, returns JWT |
| GET | `/auth/me` | Yes | Current user |
| PATCH | `/auth/me` | Yes | Update profile/email |
| POST | `/auth/email/verify` | No | Verify email token |
| POST | `/auth/password/forgot` | No | Request password reset |
| POST | `/auth/password/reset` | No | Reset with token |
| GET | `/auth/google/login` | No | Start Google OAuth |
| GET | `/auth/google/callback` | No | Google OAuth callback |
| GET | `/search/companies` | No | Symbol/name search |
| GET | `/movers` | No | Top movers |
| GET | `/movers/featured` | No | Featured mover card |
| GET | `/instruments/{symbol}` | No | Instrument detail + chart |
| GET | `/watchlist` | Yes | User watchlist |
| POST | `/watchlist` | Yes | Add to watchlist |
| DELETE | `/watchlist/{symbol}` | Yes | Remove from watchlist |
| GET | `/alerts` | Yes | User alerts |
| POST | `/alerts` | Yes | Create alert |
| DELETE | `/alerts/bulk` | Yes | Bulk alert actions |
| POST | `/simulate` | Yes | Run simulation |
| GET | `/simulate/history` | Yes | Projection history |
| POST | `/predict/forecast` | Public* | Short-term forecast |
| POST | `/project/long-term` | Public* | Long-term projection |
| WS | `/ws/quotes/{symbol}` | Yes | Real-time quote stream |

*Backend routes are public; current frontend helpers still require a token.

---

## Deployment Notes

The project is deployed on Render. See `docs/DEPLOYMENT.md` for the full setup guide.

Short summary:

- One Render web service for the full-stack app (`https://marketmetrics.dev`).
- One Render web service as a deployed test backend (`https://marketmetrics.onrender.com`).
- Shared PostgreSQL 18 database (Render, Oregon region).
- `JWT_SECRET` must be set to a secure random string. The backend will not start on Render if it is missing or set to `"change-me"`.
- Run `alembic upgrade head` on first deploy to create the schema.
- Forecast model artifacts are not persisted across Render deploys — this is a known limitation.

---

## Caching Notes

The backend uses bounded, short-lived in-memory caches for quotes, historical close data, bar history, movers, and featured movers. The frontend also caches dashboard data, instrument details, and public quotes with short TTLs.

These caches are not distributed — if multiple backend instances were running (not the current setup), they would not share state.

---

## Known Limitations

- **No frontend automated tests.** The backend suite has 99 tests but there is no Jest/Vitest/RTL suite for the React frontend.
- **No CI/CD pipeline.** Deploys are triggered manually by pushing to the GitHub remote that Render tracks.
- **No API rate limiting.** All endpoints are currently unthrottled. Routes like `/auth/register`, `/auth/login`, and `/project/long-term` should have rate limits before the app is opened to heavy public traffic.
- **Single market data provider.** All market data comes from Alpaca. If Alpaca is unavailable or a symbol is unsupported, those features fail.
- **In-memory caches are not distributed.** Caches are per-process. A second backend instance would start with cold caches.
- **WebSocket quotes are polling-backed.** The backend polls Alpaca every 30 seconds — it is not a true streaming connection to an exchange.
- **Alerts only evaluate during active WebSocket sessions.** If no browser session is open for a symbol, alerts for that symbol are not checked. There is no background monitoring process.
- **Forecast artifacts are ephemeral on Render.** The free/hobby Render tier does not persist the local filesystem between deploys. Forecast artifacts must be rebuilt or mounted from persistent storage.
- **Simulations omit real costs.** Tax, FX conversion, slippage, transaction fees, and dividend treatment are not modelled.
- **Forecasts and projections are educational.** They are analytical estimates based on historical data and user-defined assumptions. They are not financial advice.

---

## Future Improvements

- Add API rate limiting (e.g. `slowapi`) on registration, login, forecast, and projection routes.
- Build a frontend test suite (React Testing Library or Playwright for key user flows).
- Set up CI/CD with GitHub Actions for lint, test, and deploy automation.
- Persist forecast artifacts to Render Disk or S3 so they survive redeploys.
- Add cross-user isolation tests to the backend suite.
- Enable logged-out access to forecast and projection routes in the frontend (with rate limiting in place first).
- Extend simulation modelling to include basic cost assumptions (transaction fees, simple tax treatment).
- Add more alert condition types (e.g. volume-based, moving average cross).
