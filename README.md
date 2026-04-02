# MarketMetrics

MarketMetrics is a backend financial analytics platform built with FastAPI. It supports user authentication, market movers, buy-and-hold investment simulations, simulation history, personal watchlists, price alerts, and live quote streaming over WebSockets.

The project is structured as a modular API rather than a single script. Routing, business logic, persistence, authentication, and external market-data access are separated so the system is easier to reason about, extend, and evaluate as a software engineering project.

## Features
- User registration and JWT-based login
- Protected API routes for authenticated user features
- Market movers endpoint powered by Alpha Vantage
- Company search endpoint for symbol lookup and frontend search bars
- Strategy-based simulation endpoint for historical what-if analysis
- Persistent simulation history per user
- Watchlist create, list, and delete flows with live quote enrichment
- Price alert create, list, toggle, and delete flows
- Clear alert status/history in API responses for frontend use
- Live quote streaming over WebSockets
- Alembic-based database migrations
- Interactive API documentation through Swagger

## Tech Stack
- Python 3.9
- FastAPI
- SQLAlchemy
- Alembic
- Pydantic
- Uvicorn
- Alpha Vantage API
- SQLite

## Architecture Overview

The backend follows a service-based structure:

- `app/routers`: HTTP and WebSocket endpoints
- `app/services`: business logic and external API integration
- `app/models`: request and response schemas
- `app/db_models`: SQLAlchemy persistence models
- `app/core`: shared infrastructure such as database setup, auth helpers, dependencies, and configuration

This separation keeps request handling thin and pushes actual application logic into reusable service functions.

## Running Locally

1. Create and activate a virtual environment
2. Install dependencies:
   pip install -r requirements.txt
3. Create a `.env` file using `.env.example`
4. Run database migrations:
   alembic upgrade head
5. Start the server:
   uvicorn app.main:app --reload

The API will then be available at `http://127.0.0.1:8000`.

## API Documentation

When running the application locally, interactive API documentation is available at:

http://127.0.0.1:8000/docs

This is powered by FastAPI’s built-in Swagger UI.

## Database Migrations

This project uses Alembic for schema changes.

- Apply migrations: `alembic upgrade head`
- Create a new migration: `alembic revision --autogenerate -m "describe change"`
- See current revision: `alembic current`

If you already have an older local database created before Alembic was added, recreate that local database before using migrations, then run:

1. `alembic upgrade head`

## Current API Surface

The current backend includes these main routes:

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /movers/`
- `GET /search/companies?q=...`
- `POST /simulate/`
- `GET /simulate/history`
- `POST /watchlist/`
- `GET /watchlist/`
- `DELETE /watchlist/{symbol}`
- `POST /alerts/`
- `GET /alerts/`
- `GET /alerts/triggered`
- `PATCH /alerts/{alert_id}`
- `DELETE /alerts/{alert_id}`
- `WS /ws/quotes/{symbol}`

The alerts API returns active and triggered alerts separately to make frontend rendering easier. Triggered alerts can also be fetched directly through `GET /alerts/triggered`, and alerts can be reactivated with `PATCH /alerts/{alert_id}` using `{ "resetTriggered": true }`.

The watchlist API returns more than saved symbols. Each watchlist item is enriched with the latest cached quote data and a small alert summary so the frontend can render a portfolio-style overview without making several extra requests per symbol.

The simulation API now supports lump-sum buy-and-hold and dollar-cost averaging with weekly, monthly, or quarterly contributions. It returns comparative performance metrics, a best-strategy summary, and chart-ready time series data for frontend visualisation.

## Project Status

MarketMetrics is currently in the stage where the core backend flows are in place and being refined. Authentication, persistence, simulation, watchlists, alerts, and live quotes are all present. The main focus now is improving reliability, testing, and overall polish so the final system is coherent both technically and academically.
