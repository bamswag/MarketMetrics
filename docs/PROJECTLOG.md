# Project Log

This file records how MarketMetrics has developed and where the project stands as of submission.

---

## Starting Point

MarketMetrics started as a stock analysis platform rather than a simple price viewer. The original goal was to combine user accounts, tracked symbols, alerts, historical simulation, short-term forecasting, and longer-term projection in one explainable system. The project is scoped as an educational financial investment assistant — not a trading platform or commercial product.

The backend came first, which shaped the project around routes, services, schemas, models, and tests instead of one large application file. That separation has made the codebase easier to extend and test as features were added throughout the year.

---

## Backend Foundation

The backend is a FastAPI app with SQLAlchemy models, Alembic migrations, Pydantic v2 schemas, and service modules separated from route handlers. Integrations (Alpaca, Brevo, Google OAuth) are isolated in their own subpackage.

Current backend areas include auth, search, quotes, movers, instruments, watchlists, alerts, WebSocket quotes, historical simulations, forecast inference, growth projection, projection history, admin, and health checks.

---

## Authentication and Account Management

Auth began with email/password registration and JWT login. It now includes:

- Argon2 password hashing
- JWT access tokens with configurable expiry
- `sessionVersion` claim for invalidating tokens across devices (password change, logout-all-sessions)
- Google OAuth login and sign-up with account linking via `googleSubject`
- Password reset with email link (Brevo, time-limited token)
- Pending email change with verification link
- Email notification preferences
- Risk-profile preferences

Google OAuth uses a signed short-lived state token to carry `returnTo`, `intent`, `acceptedTerms`, and `frontendOrigin` through the callback flow. The backend validates the frontend origin against a strict allowlist before redirecting.

---

## Persistence and Migrations

The project uses Alembic for schema history. The current migration chain runs from `20260401_0001` through `20260425_0009`.

Schema changes over time:

1. Baseline users, watchlist, alerts, and simulation history tables.
2. Expanded simulation history metrics.
3. Alert composite index for `(userID, symbol, isActive)` queries.
4. Extended alert model: `percent_change`, `range_exit`, severity, expiration, trigger history.
5. Email notification preference field.
6. Account auth extensions: reset tokens, email verification, `primaryAuthProvider`.
7. Risk profile field.
8. Google identity linkage and password-access tracking.
9. Reworked `simulation_history` to store long-term growth projection runs.

All migrations use `render_as_batch=True` for SQLite compatibility in local development.

---

## Market Data

All market data comes from Alpaca (IEX feed by default). The app uses a locally cached symbol catalog for search, market-category display, crypto symbol naming, chart eligibility, and supported-symbol behaviour.

Several backend caches keep memory bounded on Render, especially for quotes, historical daily close data, bar data, earliest-available dates, movers, and featured movers.

---

## Tracked Symbols, Alerts, and Live Quotes

Tracked symbols let users keep a shortlist of instruments. Alerts let the system react to price movement rather than only displaying static data.

The alert system supports:

- Four condition types: `above`, `below`, `percent_change`, `range_exit`
- Severity (normal / urgent)
- Optional expiration
- Trigger history via `alert_events` table
- Bulk pause, resume, reset, and delete
- Browser notifications (with permission)
- In-app toasts
- Near-real-time quote checks through WebSocket connections

WebSocket connections are polling-backed: the backend fetches a new Alpaca quote every 30 seconds and evaluates active alerts against it. Alerts are only evaluated when an active browser session has an open connection for the relevant symbol. There is no independent background monitoring process.

---

## Historical Investment Simulations

The simulation feature lets users compare buy-and-hold and dollar-cost averaging strategies over a historical date range. Both strategies are always computed so users can see a side-by-side comparison.

Metrics include final value, profit, total return, annualised return, volatility, max drawdown, and best/worst single day. Equity and crypto use different annualisation factors (252 vs 365 trading days).

A bug was discovered and fixed during final preparation: the `run_simulation` function had a spurious `await` on `fetch_company_name`, which is a synchronous function. Awaiting it in production raised a `TypeError` and caused every `/simulate/` call to return HTTP 500. The fix was to remove the `await`. Tests were also updated to use a plain `MagicMock` instead of `AsyncMock` for that function, and regression assertions were added to catch the same class of mistake in future.

---

## Forecasting

Forecasting is an experimental analytical layer using a trained Random Forest model. Artifacts are stored under `artifacts/prediction/`. The forecast route lazy-loads ML dependencies so normal web traffic does not pull pandas, scikit-learn, or model artifacts into memory.

The frontend explains the forecasting approach through static insight cards covering Random Forest, MAE, forecast limitations, and the distinction between forecasts and long-term projections.

---

## Long-Term Projection

Long-term projection is intentionally separate from short-term forecasting. It uses:

- Historical return assumptions (derived from data) or manual overrides
- Deterministic pessimistic/baseline/optimistic scenarios
- Configurable recurring contributions and inflation rate
- Monte Carlo simulation with configurable run count
- Nominal and inflation-adjusted end values

If a valid user token is present, the backend saves the projection result to `simulation_history`. Logged-out users can compute projections at the backend level (the frontend currently requires a token before making the request).

---

## Admin Pages

Two admin pages were added:

- `/admin/users` — view and manage registered user accounts
- `/admin/audit-logs` — view audit event history

Access is controlled by the `isAdmin` flag on the user record. Normal users cannot self-promote to admin. Admin accounts must be created manually via a direct database update. The pages are implemented as lazy-loaded React components with routes protected on the frontend and enforced on the backend.

---

## Frontend Development

The frontend has grown into a full dashboard experience:

- Public landing page, login, sign-up, password reset, email verification, legal pages
- Dashboard with hero, featured mover card, tracked symbol preview, daily movers, insight cards, and alerts panel
- Instrument detail pages with charts, quotes, similar instruments, watchlist controls, and alert creation
- Search results page grouped by asset category
- Movers direction pages
- Forecast and projection pages
- Account, settings, projection history, admin pages

Recent UI work focused on cleaner dashboard density, the featured mover card, daily movers presentation, insight card placement, chart tooltip styling, and x-axis label readability.

---

## Security Hardening (Final Fixes)

Several security and reliability issues were addressed before submission:

**JWT production guard:** The backend now checks on startup whether `JWT_SECRET` is empty or set to the placeholder `"change-me"`. If running on Render and the secret is not properly set, the app refuses to start with a clear error message. This prevents accidental deployment with a known weak secret.

**Reduced PII in logs:** Operational log lines in the WebSocket handler and auth service were updated to use `user.userID` (internal UUID) instead of `user.email`. Debug-level password reset log lines that included token hash prefixes were removed. This reduces the risk of personal data appearing in unstructured server logs.

**WebSocket client error isolation:** The outer exception handler in the WebSocket route was updated to send a generic error message to the browser instead of `str(e)`. The full exception is still logged server-side with `exc_info=True`. This prevents internal error details (stack traces, database error messages) from being exposed to the client.

---

## Testing

The backend test suite covers:

- Auth (registration, login, session versioning, logout-all, email verification, password reset, Google OAuth)
- Alerts (CRUD, bulk actions, condition validation, trigger evaluation, history)
- Watchlists
- Movers
- Instruments
- Quotes
- Search
- Simulations (buy-and-hold, DCA, metrics, annualisation factor)
- Long-term projections (assumptions derivation, deterministic engine, Monte Carlo, API)
- Projection history (save, list, delete, patch notes)
- Forecasting
- WebSocket quotes (auth, quote streaming, alert evaluation)
- SQLite schema compatibility

Run the full suite with:

```bash
PYTHONPATH=.:tests .venv/bin/python -m unittest discover -s tests -v
```

Current result: **99 tests passing**.

There is no automated frontend test suite. Frontend testing (React Testing Library or Playwright) is future work.

---

## Current Deployment State

The project is deployed on Render.

- Live website: `https://marketmetrics.dev`
- Deployed test backend: `https://marketmetrics.onrender.com`
- Shared PostgreSQL 18 database (Render, Oregon)

The backend requires `FRONTEND_BASE_URL=https://marketmetrics.dev` so password reset links, email verification links, CORS, and Google OAuth redirects work correctly.

---

## Current Limitations

- No frontend automated test suite.
- No CI/CD pipeline. Deploys are triggered manually.
- No API rate limiting on any route.
- Alerts only evaluate during active WebSocket sessions — no background monitoring process.
- WebSocket quotes are polling-backed (30-second ticks), not true streaming.
- Forecast artifacts do not persist across Render redeploys without additional storage configuration.
- Simulations do not model tax, transaction costs, FX conversion, or dividends.
- Forecasts and projections are educational analytical tools, not financial advice.
- All market data depends on Alpaca availability and feed support.
- In-memory caches are per-process and not distributed.

---

## Potential Next Steps

- Add rate limiting (e.g. `slowapi`) on registration, login, forecast, and projection routes.
- Set up a frontend test suite for key user flows.
- Set up CI/CD with GitHub Actions for automated test runs and deploy triggers.
- Persist forecast artifacts to Render Disk or external storage.
- Enable logged-out forecast and projection access in the frontend (with rate limiting in place).
- Add cross-user isolation tests to the backend suite.
- Extend simulation modelling to include basic cost assumptions.
