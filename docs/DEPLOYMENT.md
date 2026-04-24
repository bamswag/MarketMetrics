# Deployment Notes

This file records the current deployment assumptions for MarketMetrics.

## Environments

- Live website: `https://marketmetrics.dev`
- Deployed test backend: `https://marketmetrics.onrender.com`
- Local full-stack/FastAPI-served frontend origin: `http://127.0.0.1:8000`
- Vite dev server default: `http://127.0.0.1:5173`

The live website is the user-facing deployment. The `marketmetrics.onrender.com` service is the deployed backend used for testing, including local frontend testing.

## Backend Runtime

The backend is a FastAPI app deployed on Render. It uses:

- PostgreSQL through `DATABASE_URL`
- Alpaca for quotes, bars, snapshots, movers, and symbol metadata
- Brevo for transactional emails
- Google OAuth for Google sign-in/sign-up
- JWT access tokens with `sessionVersion` invalidation
- forecast artifacts from `PREDICTION_MODEL_DIR`
- a built React app in `frontend/dist` when serving the full-stack site

Render deployments must have `DATABASE_URL` set. The backend raises at startup on Render if it cannot find one.

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

`FRONTEND_BASE_URL` must include `https://`. The backend uses it for password reset links, email verification links, Google OAuth frontend redirects, and the default allowed CORS origin.

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

The sender address must be verified in Brevo. If `BREVO_API_KEY` is not configured, the backend logs the email action and returns without sending.

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
PREDICTION_TRAINING_UNIVERSE=
```

`PREDICTION_TRAINING_UNIVERSE` can override the file-based training universe with a comma-separated symbol list.

## Frontend Environment

Only `VITE_*` values belong in frontend env files. These are public client configuration values, not secrets.

For local frontend testing against the deployed backend:

```text
VITE_API_BASE_URL=https://marketmetrics.onrender.com
VITE_ALLOW_REMOTE_API_IN_DEV=true
```

In development, if a remote API is configured but `VITE_ALLOW_REMOTE_API_IN_DEV` is not `true`, the frontend protects local loopback sessions by falling back to `http://127.0.0.1:8000`.

Never put `DATABASE_URL`, Alpaca keys, Brevo keys, Google client secrets, or JWT secrets in frontend configuration.

## OAuth Flow

1. The frontend sends the user to `/auth/google/login`.
2. The frontend includes `returnTo`, `intent`, `acceptedTerms` for sign-up, and `frontendOrigin`.
3. The backend validates `frontendOrigin` against `FRONTEND_BASE_URL` and `ADDITIONAL_FRONTEND_ORIGINS`.
4. The backend signs those values into a short-lived OAuth state token.
5. Google redirects back to `GOOGLE_OAUTH_REDIRECT_URI`.
6. The backend exchanges the code for Google userinfo.
7. Existing Google-linked users are logged in.
8. Existing email/password users can be linked to the Google subject.
9. New Google users are created only from sign-up intent with accepted terms.
10. The backend redirects back to the validated frontend origin with the JWT in the URL fragment.

If Google login fails after deployment, check these first:

- `FRONTEND_BASE_URL`
- `ADDITIONAL_FRONTEND_ORIGINS`
- `GOOGLE_OAUTH_REDIRECT_URI`
- the authorized redirect URI in Google Cloud Console
- whether the frontend origin was passed exactly as the browser origin

## Email Links

Password reset and pending-email verification URLs are built from `FRONTEND_BASE_URL`.

Expected live links:

```text
https://marketmetrics.dev/reset-password/<token>
https://marketmetrics.dev/verify-email/<token>
```

If emails contain links without `https://`, fix `FRONTEND_BASE_URL`.

## Render Memory Notes

The backend intentionally keeps quote, history, movers, and featured mover caches bounded. Forecast ML dependencies are lazy-loaded in the forecast route so normal web traffic does not load pandas, scikit-learn, or model artifacts into memory.

The most memory-sensitive areas are:

- forecast inference and model artifacts
- historical chart/bar caches
- movers ranking and sparkline fetches
- large concurrent projection/forecast traffic if public access is enabled

If logged-out forecast or projection access is expanded, add rate limiting before promoting it heavily.

## Security Notes

- Never commit real secrets.
- Never put backend secrets in frontend env files.
- Rotate any secret that appears in screenshots, logs, public issues, or shared documentation.
- Keep backend and frontend Render env groups separate where possible.
- `DATABASE_URL` belongs only in backend/full-stack service environment variables.
- JWTs are invalidated through `sessionVersion`; password changes and logout-all-sessions should force old tokens out.
