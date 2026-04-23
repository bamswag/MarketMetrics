# Deployment Notes

This file records the current Render deployment assumptions for MarketMetrics.

## Environments

- Live website: `https://marketmetrics.dev`
- Deployed test backend: `https://marketmetrics.onrender.com`
- Local frontend/full-stack test origin: `http://127.0.0.1:8000`
- Vite dev server default: `http://127.0.0.1:5173`

The live website is the user-facing deployment. The `marketmetrics.onrender.com` backend is used as a deployed backend for testing, including local frontend testing.

## Backend Runtime

The backend is a FastAPI app deployed on Render. It uses:

- PostgreSQL through `DATABASE_URL`
- Alpaca for market data
- Brevo for transactional emails
- Google OAuth for Google sign-in
- JWT access tokens for authenticated account features
- forecast artifacts from `PREDICTION_MODEL_DIR`

Render deployments must have `DATABASE_URL` set. The backend raises at startup on Render if it cannot find a database URL.

## Backend Environment Variables

Core:

```text
DATABASE_URL=...
JWT_SECRET=...
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
APP_LOG_LEVEL=INFO
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=60
EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES=1440
```

Frontend and CORS:

```text
FRONTEND_BASE_URL=https://marketmetrics.dev
ADDITIONAL_FRONTEND_ORIGINS=http://127.0.0.1:8000,http://127.0.0.1:5173,http://localhost:5173
```

`FRONTEND_BASE_URL` must include `https://`. The backend uses it for password reset links, email verification links, Google OAuth redirects back to the frontend, and the default allowed CORS origin.

Google OAuth:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://marketmetrics.onrender.com/auth/google/callback
```

The Google Cloud Console OAuth client must include the same backend callback URL as an authorized redirect URI.

Email:

```text
BREVO_API_KEY=...
BREVO_TRANSACTIONAL_EMAIL_URL=https://api.brevo.com/v3/smtp/email
BREVO_TIMEOUT_SECONDS=20
EMAIL_FROM_NAME=MarketMetrics
EMAIL_FROM_ADDRESS=noreply@marketmetrics.dev
```

The sender address must be a verified Brevo sender/domain.

Market data:

```text
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
ALPACA_DATA_FEED=iex
ALPACA_DATA_BASE_URL=https://data.alpaca.markets
ALPACA_TRADING_BASE_URL=https://paper-api.alpaca.markets
MARKET_DATA_DEFAULT_HISTORY_DAYS=3650
```

Forecasting and symbols:

```text
SYMBOL_CATALOG_PATH=data/symbol_catalog.json
PREDICTION_MODEL_DIR=artifacts/prediction
PREDICTION_TRAINING_LOOKBACK_DAYS=1825
PREDICTION_FETCH_CONCURRENCY=5
PREDICTION_TRAINING_UNIVERSE_PATH=data/training_universe.json
```

## Frontend Environment

For local frontend testing against the deployed backend:

```text
VITE_API_BASE_URL=https://marketmetrics.onrender.com
VITE_ALLOW_REMOTE_API_IN_DEV=true
```

Only `VITE_*` values belong in frontend env files. Do not put backend secrets in frontend configuration.

## OAuth Flow

1. The frontend builds a Google login URL pointing at the backend `/auth/google/login` endpoint.
2. The frontend includes its browser origin as `frontendOrigin`.
3. The backend validates that origin against `FRONTEND_BASE_URL` and `ADDITIONAL_FRONTEND_ORIGINS`.
4. Google redirects back to the backend callback URI.
5. The backend exchanges the code, creates a JWT, and redirects the browser back to the validated frontend origin.

If Google login fails after deployment, check these values first:

- `FRONTEND_BASE_URL`
- `ADDITIONAL_FRONTEND_ORIGINS`
- `GOOGLE_OAUTH_REDIRECT_URI`
- the authorized redirect URI in Google Cloud Console

## Email Links

Password reset and email verification URLs are built from `FRONTEND_BASE_URL`.

Expected live links:

```text
https://marketmetrics.dev/reset-password/<token>
https://marketmetrics.dev/verify-email/<token>
```

If emails contain links without `https://`, fix `FRONTEND_BASE_URL`.

## Security Notes

- Never commit real secrets.
- Never put `DATABASE_URL`, Alpaca keys, Brevo keys, Google client secrets, or JWT secrets in frontend env files.
- Rotate any secret that appears in screenshots, logs, public issues, or shared documentation.
- Keep backend and frontend Render env groups separate where possible.
