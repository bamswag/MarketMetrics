# Project Log

This file is a short record of how MarketMetrics has developed over time and what direction the project has taken.

## Starting Point

The project started as an idea for a stock analysis platform, not just a price viewer. I wanted it to do more than show charts. The main goal was to build a system that could combine:

- user accounts
- tracked symbols
- alerts
- historical simulation
- short-term forecasting
- longer-term projection

From the beginning, I wanted the backend to be modular so the project would be easier to explain and extend.

## Early Backend Work

The first phase was getting the backend structure in place. I split the project into routes, services, schemas, models, and shared core utilities instead of keeping everything in one file.

That helped with two things:

- the code became easier to read
- new features were easier to add without turning the project into a mess

## Authentication

One of the first important features was authentication. I added registration and login using JWT so user-specific features could be protected properly.

This mattered because features like tracked symbols, alerts, and saved simulations only make sense if they belong to a user account.

Later on, authentication also had to work with WebSocket quote streaming and Google sign-in, so the auth layer became a more important part of the system than I expected at the start.

## Persistence

As more user features were added, database structure became more important. I used SQLAlchemy models and Alembic migrations so schema changes were tracked properly.

This made the project feel much more stable than relying on ad hoc table creation. It also made it easier to explain how the system evolved.

## Simulation

The simulation feature was one of the first parts that felt more analytical than just “API plus data”.

I extended it beyond a simple one-off investment calculator so it could compare:

- buy-and-hold
- dollar-cost averaging
- recurring contributions over time

I also added metrics like return, volatility, and drawdown so the output was more useful.

## Tracked Symbols, Alerts, and Live Quotes

Another big step was building a better monitoring flow.

Tracked symbols were added so users could save names they cared about. Alerts were added so the system could respond to price conditions instead of only showing passive data. Then WebSocket quote streaming helped connect those parts into something that felt more live.

This part of the project made the app feel less like a collection of CRUD routes and more like an actual market tool.

## Forecasting

The forecasting module was added as a separate analytical layer. I wanted it to be more than a token “AI” feature, so I treated it as its own part of the project with training, evaluation, and saved artifacts.

Over time I improved it by adding:

- better features
- benchmark context
- date-aware validation
- multiple models for comparison
- interval output

That made it easier to justify the forecasting results instead of just exposing model predictions without explanation.

## Long-Term Projection

One design choice I am happy with is keeping long-term projection separate from short-term forecasting.

Short-term forecasting tries to estimate what may happen over the next few trading days.

Long-term projection is different. It is more about planning and assumptions over years, so I built it as a separate engine with:

- deterministic scenarios
- Monte Carlo output
- inflation-aware values
- recurring contributions

That separation makes the project more methodologically sensible.

## Frontend Development

The frontend came later, after the backend had enough features to support a real dashboard.

The frontend now includes:

- landing page
- login and signup pages
- dashboard
- instrument detail pages
- tracked symbols page
- account and settings pages

One of the main improvements during this phase was moving away from a rough prototype feel and making the UI look more like a market dashboard.

## Testing

As the project grew, testing became more important. The backend test suite now covers the main systems such as:

- authentication
- alerts
- watchlists
- movers
- instruments
- simulations
- forecasting

This helped a lot when features started interacting with each other.

## Current State

At this point, the project has grown into a fairly broad market analysis system with:

- backend APIs
- user-specific features
- live market data
- chart-oriented frontend pages
- forecasting and projection tools

It is still not a production trading platform, but it is much more complete than the original idea.

## Limitations

Some limitations are still clear:

- the forecasting model is still experimental
- the project still depends heavily on one market-data provider
- the frontend can still be polished further
- deployment is not fully finished yet

## Next Steps

The next useful steps are:

- keep refining the frontend
- improve deployment
- tidy documentation for submission
- keep tightening the explanation of the analytical parts

## Reflection

The biggest lesson from this project has been that building a stronger system is not only about adding features. A lot of the real progress came from restructuring, simplifying, and revisiting earlier choices once the project had more moving parts.
