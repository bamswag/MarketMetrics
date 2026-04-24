# Project Log

This file records how MarketMetrics has developed and where the project stands now.

## Starting Point

MarketMetrics started as a stock analysis platform rather than a simple price viewer. The original goal was to combine user accounts, tracked symbols, alerts, historical simulation, short-term forecasting, and longer-term projection in one explainable system.

The backend came first, which shaped the project around routes, services, schemas, models, and tests instead of one large application file.

## Backend Foundation

The backend is a FastAPI app with SQLAlchemy models, Alembic migrations, Pydantic schemas, and service modules. That split made it easier to add features without mixing API handlers, database operations, external API calls, and business logic together.

Current backend areas include auth, search, quotes, movers, instruments, watchlists, alerts, WebSocket quotes, historical simulation, forecast inference, growth projection, projection history, and health checks.

## Authentication And Account Management

Auth began with email/password registration and JWT login. It now includes:

- Argon2 password hashing
- JWT access tokens
- `sessionVersion` invalidation for password changes and logout-all-sessions
- Google OAuth login/sign-up
- Google account linking through `googleSubject`
- password reset tokens
- pending email verification
- email notification preferences
- risk-profile preferences

Google OAuth uses a signed state token that carries `returnTo`, `intent`, `acceptedTerms`, and `frontendOrigin`.

## Persistence And Migrations

The project uses Alembic migrations for schema history. The current migration chain runs from `20260401_0001` through `20260425_0009`.

Important schema changes over time:

- baseline users, alerts, simulation history, and watchlist tables
- expanded simulation metrics
- alert composite index
- expanded alert model with `percent_change`, `range_exit`, severity, expiration, and trigger history
- email notification preference
- account auth extensions
- risk profile
- Google identity and password-access tracking
- reworked `simulation_history` to store growth projection runs

## Market Data

Alpaca powers quotes, historical bars, snapshots, movers, and asset metadata. The app uses a local symbol catalog for search, market-category display, crypto naming, chart eligibility, and supported-symbol behavior.

Several backend caches keep memory bounded on Render, especially for quotes, historical daily close data, bar data, earliest-available dates, movers, and featured movers.

## Tracked Symbols, Alerts, And Live Quotes

Tracked symbols let users keep a shortlist of instruments. Alerts let the system react to price movement rather than only displaying static data.

The alert system now supports:

- `above`
- `below`
- `percent_change`
- `range_exit`
- severity
- expiration
- trigger history
- bulk pause/resume/reset/delete
- browser notifications
- in-app toasts
- WebSocket quote checks for active alert symbols

This moved the product closer to an actual monitoring workspace.

## Forecasting

Forecasting is an experimental analytical layer using trained artifacts under `artifacts/prediction`. The route lazy-loads model dependencies to protect normal web traffic from unnecessary memory usage.

The frontend explains forecasting through insight cards covering Random Forest, MAE, forecast limitations, and the distinction between forecasts and long-term projections.

## Long-Term Projection

Long-term projection is intentionally separate from short-term forecasting. It uses assumptions, deterministic pessimistic/baseline/optimistic scenarios, recurring contributions, inflation settings, and Monte Carlo ranges.

The projection route now accepts optional auth. If a valid user is present, the backend saves the projection into `simulation_history`; logged-out requests can still compute a projection at the backend level.

## Frontend Development

The frontend has grown into a full dashboard experience:

- public landing page
- login, sign-up, password reset, and email verification flows
- dashboard hero with product intro and risk profile
- featured mover card
- tracked-symbol preview
- daily movers with gainers/losers and insight cards
- compact alerts/activity preview
- instrument chart pages
- forecast and projection pages
- account, settings, and history pages

Recent UI work focused on making the homepage/dashboard feel more product-ready: less oversized alert management UI, cleaner dashboard hero copy, insight cards placed around market content, restored chart tooltip styling, and clearer daily movers sections.

## Testing

The backend test suite covers:

- auth
- alerts
- watchlists
- movers
- instruments
- quotes
- search
- simulations and projection history
- forecasting
- projections
- WebSocket quotes
- SQLite schema compatibility

Run all backend tests with:

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
```

## Current Deployment State

The project is deployed on Render.

- Live website: `https://marketmetrics.dev`
- Deployed test backend: `https://marketmetrics.onrender.com`
- Local full-stack/FastAPI origin: `http://127.0.0.1:8000`
- Vite dev origin: `http://127.0.0.1:5173`

The backend environment needs `FRONTEND_BASE_URL=https://marketmetrics.dev` so password reset links, email verification links, CORS, and Google OAuth redirects point to the live frontend.

Local origins such as `http://127.0.0.1:8000` and `http://127.0.0.1:5173` belong in `ADDITIONAL_FRONTEND_ORIGINS` when they need to call the deployed backend.

## Current Limitations

- Forecasting and projection outputs are not financial advice.
- Alpaca availability and feed limits affect many product surfaces.
- Public forecast/projection usage should have rate limits before being promoted.
- Forecast artifacts must exist for the forecast route to work.
- Historical market-data caches need to stay bounded to protect Render memory.
- The frontend can continue to be refined, especially around responsive dashboard density and product copy.

## Next Useful Steps

- Add rate limiting and abuse protection around expensive public routes.
- Keep tightening dashboard layout and responsive behavior.
- Add clearer forecast/projection confidence and limitation messaging.
- Expand frontend tests or browser-based smoke checks for key routes.
- Keep documentation synced whenever schema, auth, deployment, or route behavior changes.
