# Deployment Notes

This file records the deployment setup for MarketMetrics on Render.

---

## Environments

| Environment | URL |
|---|---|
| Live website (full-stack) | `https://marketmetrics.dev` |
| Deployed test backend | `https://marketmetrics.onrender.com` |
| Local FastAPI + built frontend | `http://127.0.0.1:8000` |
| Local Vite dev server | `http://127.0.0.1:5173` |

The live website serves the built React frontend from FastAPI's static file handler. The test backend is the same codebase but without the frontend build — it is used for local frontend development pointed at a real deployed API.

Both services share the same PostgreSQL 18 database on Render (Oregon region).

---

## Render Service Setup

Two separate Render web services are currently configured:

**Market Metrics Fullstack (live site)**
- Serves the FastAPI backend plus the built `frontend/dist`.
- Build command: `cd frontend && npm install && npm run build && cd .. && pip install -r requirements.txt && alembic upgrade head`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

**Market Metrics Backend (test service)**
- FastAPI backend only, no frontend build.
- Used for local frontend development testing.
- Same build/start commands minus the frontend steps.

---

## PostgreSQL Database

A shared PostgreSQL 18 database (Render managed, Oregon region) is connected to both services.

Set `DATABASE_URL` in each service's environment variables in the Render dashboard. The connection string follows the standard PostgreSQL format.

The backend raises at startup on Render if `DATABASE_URL` is not set.

Migrations run automatically during the build command (`alembic upgrade head`). The current migration chain runs from `20260401_0001` to `20260425_0009`.

---

## Required Environment Variables

Set these in the Render dashboard for each backend service. Never put secrets in frontend env files.

### Core / Security

```text
JWT_SECRET=<secure random string — generate with: python -c "import secrets; print(secrets.token_hex(32))">
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
APP_LOG_LEVEL=INFO
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=60
EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES=1440
```

**Important:** `JWT_SECRET` must be a long, random string. The backend refuses to start on Render if this value is missing or set to the placeholder `"change-me"`. If the service fails to start after a deploy, check this variable first.

### Database

```text
DATABASE_URL=<your Render PostgreSQL connection string>
```

### Frontend and CORS

```text
FRONTEND_BASE_URL=https://marketmetrics.dev
ADDITIONAL_FRONTEND_ORIGINS=http://127.0.0.1:8000,http://127.0.0.1:5173,http://localhost:5173
```

`FRONTEND_BASE_URL` must include the scheme (`https://`). It is used for:
- Password reset email links
- Email verification links
- Google OAuth frontend redirect
- Default CORS allowed origin

`ADDITIONAL_FRONTEND_ORIGINS` is a comma-separated list of any other origins that should be allowed (e.g. local dev origins calling the deployed backend).

### Google OAuth

```text
GOOGLE_CLIENT_ID=<your Google OAuth client ID>
GOOGLE_CLIENT_SECRET=<your Google OAuth client secret>
GOOGLE_OAUTH_REDIRECT_URI=https://marketmetrics.onrender.com/auth/google/callback
```

The redirect URI in Google Cloud Console → OAuth credentials must exactly match `GOOGLE_OAUTH_REDIRECT_URI`. For the live site, also add `https://marketmetrics.dev/auth/google/callback`.

### Email (Brevo)

```text
BREVO_API_KEY=<your Brevo API key>
BREVO_TRANSACTIONAL_EMAIL_URL=https://api.brevo.com/v3/smtp/email
BREVO_TIMEOUT_SECONDS=20
EMAIL_FROM_NAME=MarketMetrics
EMAIL_FROM_ADDRESS=<your verified Brevo sender address>
```

The sender address must be verified in your Brevo account. If `BREVO_API_KEY` is not configured, the backend logs the email content instead of sending it — useful for local development.

### Market Data (Alpaca)

```text
ALPACA_API_KEY=<your Alpaca API key>
ALPACA_SECRET_KEY=<your Alpaca secret key>
ALPACA_DATA_FEED=iex
ALPACA_DATA_BASE_URL=https://data.alpaca.markets
ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets
MARKET_DATA_DEFAULT_HISTORY_DAYS=3650
```

The IEX feed is the default. Alpaca free-tier keys work with IEX. If market data routes fail after deploy, verify the keys are correct and the feed is set properly.

### Forecasting and Symbol Data

```text
SYMBOL_CATALOG_PATH=data/symbol_catalog.json
PREDICTION_MODEL_DIR=artifacts/prediction
PREDICTION_TRAINING_LOOKBACK_DAYS=1825
PREDICTION_FETCH_CONCURRENCY=5
PREDICTION_TRAINING_UNIVERSE_PATH=data/training_universe.json
PREDICTION_TRAINING_UNIVERSE=
```

`PREDICTION_TRAINING_UNIVERSE` can override the file-based training symbol list with a comma-separated value.

---

## Frontend Build

The frontend is built during the Render build step:

```bash
cd frontend && npm install && npm run build
```

The output goes to `frontend/dist`. FastAPI detects that directory at startup and serves the React app and its assets. All unknown routes fall back to `index.html` so React Router handles client-side navigation.

`frontend/.env.development` is not used in production builds — Vite only reads `.env.production` (or `.env`) during `npm run build`. Production frontend configuration comes from what is baked into the build at build time.

---

## Running Migrations

Migrations run automatically as part of the build command on Render. To run them manually:

```bash
alembic upgrade head
```

To create a new migration:

```bash
alembic revision -m "describe the change"
```

All migrations use `render_as_batch=True` in their op context for SQLite compatibility in local development.

---

## Admin Account Setup

Admin access is controlled by the `isAdmin` field on the `users` table. There is no self-service admin registration — admin accounts must be provisioned manually.

**To create an admin account:**

1. Register a normal account through the app.
2. Connect to the Render PostgreSQL database using psql or a DB GUI.
3. Run:

```sql
UPDATE users SET "isAdmin" = true WHERE email = 'your-admin-email@example.com';
```

**Assessment admin account (for marker use):**

- Email: `admin@marketmetrics.dev`
- Password: `password123`
- Routes: `/admin/users` and `/admin/audit-logs`

Normal users visiting these routes will see a permission error or be redirected.

---

## OAuth Flow Summary

1. Frontend sends the user to `GET /auth/google/login` with `returnTo`, `intent`, `acceptedTerms`, and `frontendOrigin` query params.
2. Backend validates `frontendOrigin` against `FRONTEND_BASE_URL` and `ADDITIONAL_FRONTEND_ORIGINS`, then signs those values into a short-lived state token.
3. User authenticates with Google. Google redirects back to `GOOGLE_OAUTH_REDIRECT_URI`.
4. Backend exchanges the code, reads the state token, and either logs in or creates the user.
5. Backend redirects back to the validated frontend origin with the JWT in the URL fragment.

If Google login breaks after a deploy, check:
- `FRONTEND_BASE_URL` includes scheme
- `ADDITIONAL_FRONTEND_ORIGINS` includes any local dev origin in use
- `GOOGLE_OAUTH_REDIRECT_URI` matches what is registered in Google Cloud Console
- The Google Cloud Console OAuth client is not restricted to specific test users (if still in test mode)

---

## Email Links

Password reset and email verification URLs are built from `FRONTEND_BASE_URL`. Expected live links:

```
https://marketmetrics.dev/reset-password/<token>
https://marketmetrics.dev/verify-email/<token>
```

If emails arrive with broken or missing-scheme links, check `FRONTEND_BASE_URL`.

---

## Render Memory Notes

The backend uses bounded in-memory caches for quotes, historical chart data, movers, and featured movers. Forecast ML dependencies (pandas, scikit-learn, joblib) are lazy-loaded so normal web traffic does not pull them into memory.

The most memory-sensitive areas:

- Forecast inference (large model artifacts + pandas)
- Historical bar and close-series caches
- Movers ranking and sparkline fetches under concurrent traffic
- Long-term Monte Carlo projections under concurrent logged-out traffic (not currently promoted heavily)

If memory pressure becomes an issue on the Render free/starter tier, reduce cache sizes in the service code or upgrade the instance.

---

## Forecast Artifact Persistence

Forecast model artifacts are stored under `artifacts/prediction/` in the local filesystem. On Render's free and starter tiers, the filesystem is ephemeral — artifacts are lost when the service redeploys or restarts.

For the forecast route to work after a redeploy, either:
- Re-run the training script after deploy (not automated currently), or
- Attach a Render Disk to the service and point `PREDICTION_MODEL_DIR` at the mounted path, or
- Commit a pre-trained artifact set to the repository (only viable for small models).

This is a known limitation for the current deployment setup.

---

## Security Checklist

- [ ] `JWT_SECRET` is set to a secure random string (not `"change-me"`)
- [ ] `DATABASE_URL` is only in backend service env vars, not frontend
- [ ] Alpaca and Brevo keys are only in backend env vars
- [ ] Google client secret is only in backend env vars
- [ ] `FRONTEND_BASE_URL` includes `https://`
- [ ] Google Cloud Console redirect URIs match `GOOGLE_OAUTH_REDIRECT_URI`
- [ ] Brevo sender address is verified
- [ ] No real secrets committed to the repository

---

## Deployment Limitations

This deployment is suitable for a final-year project. It is not commercially hardened:

- No API rate limiting is currently configured. Adding `slowapi` or Cloudflare-level rate limiting is recommended before opening expensive routes (forecast, projection) to heavy public traffic.
- The backend runs as a single process. In-memory caches are not distributed.
- Render free/starter tier has limited memory and CPU. Forecast inference and Monte Carlo projections are the most resource-intensive operations.
- Forecast artifacts do not persist across redeploys without additional storage configuration.
- No CI/CD pipeline is set up. Deploys are triggered manually by pushing to the GitHub remote that Render tracks.
