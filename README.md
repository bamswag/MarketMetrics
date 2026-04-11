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
- Alpaca market data
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
