# Deployment Notes

This document explains how MarketMetrics is deployed and configured on Render. It focuses mainly on the live full-stack deployment, because that is the version intended for assessment and demonstration.

MarketMetrics is deployed as a FastAPI backend serving a built React/Vite frontend, with PostgreSQL used for production persistence.

---

## 1. Deployment Overview

The main deployed version of the system is https://marketmetrics.dev
 
This live service runs the FastAPI backend and serves the built React frontend from `frontend/dist`.

Additional environments used during development are:


Live full-stack site: https://marketmetrics.dev  
Backend test service: https://marketmetrics.onrender.com  
Local FastAPI server: http://127.0.0.1:8000  
Local Vite dev server: http://127.0.0.1:5173


The backend-only Render service is mainly used for testing the frontend against a deployed API during development. The full-stack service is the main deployment that should be used for marking and demonstration.

Both Render services are configured from the same codebase and use the same managed PostgreSQL database.

### Repository Used for Deployment

The live Render deployment is connected to my GitHub repository: https://github.com/bamswag/MarketMetrics  

I did not deploy directly from the University GitLab repository because the GitLab submission repository is private and was used as the official academic submission copy rather than the deployment source.

The same final codebase is mirrored to the University GitLab repository for submission. GitLab should therefore be treated as the official submitted snapshot, while GitHub is the repository Render uses to build and deploy the live website.

## 2. Render Services

Two Render web services are currently configured.

### Market Metrics Fullstack

This is the main live deployment.

It performs three jobs:

1. Builds the React frontend.
2. Runs the FastAPI backend.
3. Serves the compiled frontend through FastAPI.

Recommended build command:

```bash
cd frontend && npm install && npm run build && cd .. && pip install -r requirements.txt && alembic upgrade head
```

Recommended start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Market Metrics Backend

This is a backend-only test service.

It is mainly useful when running the frontend locally while pointing it at a real deployed API. It uses the same backend code and database, but it does not need to build or serve the React frontend.

This service is not the main assessment deployment.

---

## 3. PostgreSQL Database

MarketMetrics uses a managed PostgreSQL database on Render for deployed environments.

The database connection is supplied through the `DATABASE_URL` environment variable.

```text
DATABASE_URL=<The Render PostgreSQL Internal Database URL>
```

Do not commit the real database URL to the repository. The actual value contains credentials and must only be stored in Render environment variables or in a local `.env` file that is not committed.

A typical PostgreSQL connection string has this format:

```text
postgresql://user:password@host:port/database
```

The backend will fail to start on Render if `DATABASE_URL` is missing. This avoids accidentally running the deployed system without the intended production database.

Database migrations are managed with Alembic and are run during deployment using:

```bash
alembic upgrade head
```

---

## 4. Required Environment Variables

All sensitive values must be configured in the Render dashboard. They must not be committed to GitHub or GitLab.

### Core and Security

```text
JWT_SECRET=<a secure random string>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
APP_LOG_LEVEL=INFO
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=60
EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES=1440
```

### Database

```text
DATABASE_URL=<The Render PostgreSQL Internal Database URL>
```

Use Render's internal database URL for the deployed Render service where possible. Use the external database URL only when connecting from your own machine with tools such as `psql` or a database GUI.


---

### Frontend and CORS

```text
FRONTEND_BASE_URL=https://marketmetrics.dev
ADDITIONAL_FRONTEND_ORIGINS=http://127.0.0.1:8000,http://127.0.0.1:5173,http://localhost:5173
```

`FRONTEND_BASE_URL` is used to build links for:

- password reset emails
- email verification emails
- Google OAuth redirects
- default CORS configuration

The value must include the scheme, for example:

```text
https://marketmetrics.dev
```

`ADDITIONAL_FRONTEND_ORIGINS` is a comma-separated list of extra origins that should be allowed to call the backend. This is useful for local development.

---

### Google OAuth

```text
GOOGLE_CLIENT_ID=<your Google OAuth client ID>
GOOGLE_CLIENT_SECRET=<your Google OAuth client secret>
GOOGLE_OAUTH_REDIRECT_URI=https://marketmetrics.dev/auth/google/callback
```

For the live full-stack site, the Google Cloud Console redirect URI should include:

```text
https://marketmetrics.dev/auth/google/callback
```

If the backend test service is also being used for OAuth testing, add this as an additional redirect URI:

```text
https://marketmetrics.onrender.com/auth/google/callback
```

The redirect URI configured in Google Cloud Console must exactly match the value used by the backend.

---

### Email with Brevo

```text
BREVO_API_KEY=<your Brevo API key>
BREVO_TRANSACTIONAL_EMAIL_URL=https://api.brevo.com/v3/smtp/email
BREVO_TIMEOUT_SECONDS=20
EMAIL_FROM_NAME=MarketMetrics
EMAIL_FROM_ADDRESS=<your verified Brevo sender address>
```

Brevo is used for transactional email features such as password reset and email verification.

The sender email address must be verified in Brevo. If `BREVO_API_KEY` is not configured locally, the backend logs email content instead of sending real emails. This is useful during development, but the deployed version should have Brevo configured properly.

---

### Market Data with Alpaca

```text
ALPACA_API_KEY=<your Alpaca API key>
ALPACA_SECRET_KEY=<your Alpaca secret key>
ALPACA_DATA_FEED=iex
ALPACA_DATA_BASE_URL=https://data.alpaca.markets
ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets
MARKET_DATA_DEFAULT_HISTORY_DAYS=3650
```

MarketMetrics currently uses Alpaca as the market data provider. The IEX feed is used by default because it is suitable for free-tier Alpaca accounts.

If market data routes fail after deployment, check that:

- the Alpaca API key is correct
- the Alpaca secret key is correct
- the data feed is set correctly
- the account has access to the requested data

---

### Forecasting and Symbol Data

```text
SYMBOL_CATALOG_PATH=data/symbol_catalog.json
PREDICTION_MODEL_DIR=artifacts/prediction
PREDICTION_TRAINING_LOOKBACK_DAYS=1825
PREDICTION_FETCH_CONCURRENCY=5
PREDICTION_TRAINING_UNIVERSE_PATH=data/training_universe.json
PREDICTION_TRAINING_UNIVERSE=
```

`SYMBOL_CATALOG_PATH` points to the local symbol catalogue used by search and market features.

`PREDICTION_MODEL_DIR` points to the directory containing forecasting model artifacts.

`PREDICTION_TRAINING_UNIVERSE` can optionally override the file-based training universe with a comma-separated list of symbols.

---

## 5. Frontend Build and Static Serving

The React frontend is built during the Render build step:

```bash
cd frontend && npm install && npm run build
```

The output is written to:

```text
frontend/dist
```

When `frontend/dist` exists, FastAPI serves the compiled frontend and static assets. Unknown routes fall back to `index.html`, allowing React Router to handle client-side routes such as:

```text
/dashboard
/account
/admin/users
/admin/audit-logs
```

For local development, the frontend can also be run separately with Vite:

```bash
cd frontend
npm install
npm run dev
```

This starts the frontend at:

```text
http://127.0.0.1:5173
```

---

## 6. Running Migrations

Migrations are run automatically during the Render build command:

```bash
alembic upgrade head
```

To run migrations manually:

```bash
alembic upgrade head
```

To create a new migration:

```bash
alembic revision -m "describe the change"
```

Alembic is the main source of truth for database schema changes. SQLite compatibility is also supported for local development and testing.

---

## 7. Admin Account Setup

Admin access is controlled by the `isAdmin` field on the `users` table.

Normal users cannot register themselves as admins. Admin access must be provisioned manually.

### Creating an Admin Account Locally

The simplest local setup method is:

```bash
python scripts/create_admin.py
```

This script creates or promotes the configured admin account.

### Manually Promoting a User

A user can also be promoted manually through PostgreSQL:

```sql
UPDATE users
SET "isAdmin" = true
WHERE email = 'your-admin-email@example.com';
```

### Admin Account

For assessment and demonstration, the admin account is:


Email:    admin@marketmetrics.dev  
Password: password.123


Admin routes:

```text
/admin/users
/admin/audit-logs
```

Normal users should not be able to access these pages.

---

## 8. Google OAuth Flow

The Google OAuth flow works as follows:

1. The frontend sends the user to `GET /auth/google/login`.
2. The backend validates the frontend origin against the allowed origins.
3. The backend creates a short-lived signed OAuth state token.
4. The user signs in with Google.
5. Google redirects the user back to the configured callback URL.
6. The backend exchanges the code for Google user information.
7. The backend logs in or creates the user.
8. The user is redirected back to the frontend with an authentication token.

If Google login fails after deployment, check:

- `FRONTEND_BASE_URL` includes `https://`
- `GOOGLE_OAUTH_REDIRECT_URI` exactly matches Google Cloud Console
- `ADDITIONAL_FRONTEND_ORIGINS` includes local origins if testing locally
- Google OAuth client credentials are correctly configured
- the Google OAuth app is not restricted to unapproved test users

---

## 9. Email Links

Password reset and email verification links are generated from `FRONTEND_BASE_URL`.

Expected live formats:

```text
https://marketmetrics.dev/reset-password/<token>
https://marketmetrics.dev/verify-email/<token>
```

If email links are broken, missing `https://`, or pointing to the wrong domain, check the `FRONTEND_BASE_URL` environment variable.

---

## 10. Forecast Artifacts

Forecast model artifacts are stored under:

```text
artifacts/prediction/
```

The current repository includes forecast artifacts so that the forecast feature can run without retraining immediately after cloning or deployment.

However, Render's free/starter filesystem can be ephemeral. If the model artifacts are generated or updated at runtime, they may be lost after a redeploy or restart unless persistent storage is configured.

More robust future options include:

- attaching a Render Disk
- storing artifacts in S3 or another object store
- adding a formal model retraining and deployment pipeline

This is a known deployment limitation rather than a core feature failure.

---

## 11. Render Memory Notes

The backend uses in-memory caches for performance, including:

- quote data
- price history
- market movers
- featured mover data
- forecasting model artifacts

These caches are bounded, but they are still process-local. This is acceptable for the current final-year project deployment, but it would need redesigning for a larger multi-instance production system.

The most memory-sensitive areas are:

- forecasting inference
- pandas/scikit-learn model loading
- historical price history retrieval
- movers and sparkline generation
- Monte Carlo long-term projections

If memory pressure becomes a problem, the likely improvements would be:

- reducing cache sizes
- using a larger Render instance
- moving caches to Redis
- moving model artifacts to persistent storage
- adding rate limiting around expensive routes

---

## 12. Security Checklist

Before deployment, check:

- [ ] `JWT_SECRET` is set and is not `"change-me"`
- [ ] `DATABASE_URL` is only stored in backend environment variables
- [ ] Alpaca keys are only stored in backend environment variables
- [ ] Brevo keys are only stored in backend environment variables
- [ ] Google client secret is only stored in backend environment variables
- [ ] `FRONTEND_BASE_URL` includes `https://`
- [ ] Google OAuth redirect URIs match the deployed backend
- [ ] Brevo sender address is verified
- [ ] no real secrets are committed to the repository
- [ ] admin access is restricted to users with `isAdmin = true`

---

## 13. Testing the Deployment

After deployment, the following checks should be performed manually:

1. Open the live site:

```text
https://marketmetrics.dev
```

2. Confirm the home page loads.

3. Register or log in.

4. Check dashboard market data.

5. Open an instrument page.

6. Test watchlist and alert features.

7. Test password reset or email verification if needed.

8. Log in as the admin account and check:

```text
/admin/users
/admin/audit-logs
```

9. Check the health endpoint:

```text
/health
```

10. Check Render logs for any startup errors.

---

## 14. Known Deployment Limitations

This deployment is suitable for a final-year project, but it is not commercially hardened.

Known limitations include:

- no formal API rate limiting yet
- no CI/CD pipeline
- no Docker-based deployment
- no production monitoring or alerting system
- in-memory caches are not shared across multiple instances
- WebSocket quote updates are polling-backed rather than true exchange streaming
- alerts are not evaluated by a fully independent background worker
- forecast artifacts require more robust persistence for long-term production use
- expensive routes such as forecasting and projections would need stricter limits before public commercial use
- the system depends on Alpaca as a single market data provider

These limitations are acceptable for the current academic scope, but they are important future work items.

---

## 15. Final Notes

The main deployment path for assessment is the full-stack Render service at:

```text
https://marketmetrics.dev
```

The backend-only Render service exists for development and testing, but the full-stack deployment is the version that best represents the completed system.

No real credentials should ever be committed to the repository. All secrets must be configured through Render environment variables or local `.env` files excluded by `.gitignore`.