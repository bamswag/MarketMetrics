# MarketMetrics

MarketMetrics is a stock analysis project built around a FastAPI backend and a React frontend. The idea behind it is to keep market search, tracked symbols, alerts, simulation tools, forecasting, and long-term projection in one system instead of splitting them across separate mini apps.

The project started as a backend-first build, so a lot of the structure is focused on clean services, reusable logic, and routes that are easy to test. The frontend is there to surface that functionality in a more practical way.

## Main Features

- user registration and login
- Google sign-in support
- stock and company search
- tracked symbols / watchlist workflow
- price alerts
- daily movers
- live quote streaming
- historical investment simulation
- simulation history
- short-term forecasting
- long-term portfolio projection

## Tech Stack

### Backend

- Python 3.9
- FastAPI
- SQLAlchemy
- Alembic
- Pydantic
- SQLite for local development
- PostgreSQL on Render
- Alpaca market data
- Brevo transactional email
- pandas, numpy, scikit-learn, joblib

### Frontend

- React
- TypeScript
- Vite
- React Router
- Recharts

## Project Structure

- `app/api/routes`
  API and WebSocket routes
- `app/services`
  main backend logic
- `app/integrations/alpaca`
  Alpaca-specific data access
- `app/forecasting`
  training and forecast logic
- `app/projections`
  long-term growth projection logic
- `app/orm_models`
  database models
- `app/schemas`
  request and response schemas
- `frontend/src`
  React app
- `tests`
  backend tests
- `docs`
  supporting project notes and diagrams

## Running Locally

### Backend

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and fill in the values you need.
4. Run migrations:

```bash
alembic upgrade head
```

5. Start the backend:

```bash
uvicorn app.main:app --reload
```

The API should then be available at [http://127.0.0.1:8000](http://127.0.0.1:8000).

Swagger docs:
[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### Frontend

From the `frontend` folder:

```bash
npm install
npm run dev
```

The frontend normally runs at:
[http://127.0.0.1:5173](http://127.0.0.1:5173)

The current local full-stack/browser origin used for backend CORS testing is:
[http://127.0.0.1:8000](http://127.0.0.1:8000)

## Deployment

MarketMetrics is deployed on Render with separate live and test entry points.

- Live website: [https://marketmetrics.dev](https://marketmetrics.dev)
- Test backend: [https://marketmetrics.onrender.com](https://marketmetrics.onrender.com)
- Local frontend/full-stack test origin: [http://127.0.0.1:8000](http://127.0.0.1:8000)

The backend uses PostgreSQL on Render, Alpaca for market data, Brevo for transactional email, and Google OAuth for social login.

More deployment detail lives in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### Backend Environment

Important backend environment variables:

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
- `PREDICTION_TRAINING_UNIVERSE_PATH`
- `MARKET_DATA_DEFAULT_HISTORY_DAYS`

For the live deployment, `FRONTEND_BASE_URL` must include the scheme:

```text
FRONTEND_BASE_URL=https://marketmetrics.dev
```

If the deployed backend is used from a local frontend origin, include that origin in `ADDITIONAL_FRONTEND_ORIGINS`:

```text
ADDITIONAL_FRONTEND_ORIGINS=http://127.0.0.1:8000,http://127.0.0.1:5173,http://localhost:5173
```

For the deployed backend, the Google callback should point at the backend callback route:

```text
GOOGLE_OAUTH_REDIRECT_URI=https://marketmetrics.onrender.com/auth/google/callback
```

Google Cloud Console must include the same redirect URI.

### Frontend Environment

The frontend API base URL is controlled by `VITE_API_BASE_URL`.

For local frontend testing against the deployed test backend:

```text
VITE_API_BASE_URL=https://marketmetrics.onrender.com
VITE_ALLOW_REMOTE_API_IN_DEV=true
```

Do not put backend secrets, database URLs, Alpaca keys, Brevo keys, Google client secrets, or JWT secrets in frontend env files.

## Forecasting Model

Before using the forecasting endpoint, train a model:

```bash
python scripts/train_stock_model.py
```

Common optional flags:

- `--symbols AAPL MSFT NVDA`
- `--version rf_demo`
- `--lookback-days 1825`

Model artifacts are written into the prediction directory configured in `.env`.

## Symbol Catalog

To refresh the local symbol catalog from Alpaca:

```bash
python scripts/sync_symbol_catalog.py
```

## Useful Commands

- apply migrations: `alembic upgrade head`
- create a migration: `alembic revision --autogenerate -m "describe change"`
- current migration: `alembic current`
- run backend tests:

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
```

- build frontend:

```bash
cd frontend
npm run build
```

## Current API Areas

- `/auth`
- `/search`
- `/movers`
- `/watchlist`
- `/alerts`
- `/simulate`
- `/predict`
- `/project`
- `/ws/quotes/{symbol}`

## Notes

- The forecasting part of the project is experimental and should not be treated as financial advice.
- The long-term projection tool is separate from the short-term forecasting model on purpose.
- The frontend and backend are in the same repo, but they run as separate apps during development.
