# MarketMetrics FAQ

## What is MarketMetrics?

MarketMetrics is a stock analysis project with a FastAPI backend and a React frontend. It brings together search, tracked symbols, alerts, simulation, forecasting, and long-term projection in one system.

## What does the project actually do?

The project currently supports:

- user registration and login
- Google sign-in
- stock/company search
- tracked symbols
- price alerts
- daily movers
- live quote streaming
- historical investment simulation
- simulation history
- short-term forecasting
- long-term projection

## Why is the backend such a big part of the project?

The backend handles most of the logic in the system. That includes:

- auth
- database access
- market-data integration
- alert evaluation
- simulation logic
- forecasting logic
- projection logic

Starting with the backend made it easier to build the features properly before designing the UI around them.

## Why did I use FastAPI?

FastAPI made sense for this project because it works well with typed schemas, async routes, dependency injection, and automatic API docs.

It also fits well with a service-based backend structure.

## What is the difference between simulation, forecasting, and projection?

### Simulation

Simulation looks backward.

It answers a question like:

> What would have happened if someone had invested in the past using a certain strategy?

### Forecasting

Forecasting looks at the near future.

It answers a question like:

> Based on recent data, what might happen over the next few trading days?

### Projection

Projection looks much further ahead.

It answers a question like:

> How might an investment grow over years under different assumptions?

These are separate on purpose because they are not the same problem.

## Why is long-term projection separate from forecasting?

A short-term forecasting model is not a good tool for estimating something 10 or 20 years into the future.

That is why the long-term projection feature has its own logic and uses scenario-based planning and Monte Carlo output instead.

## What does the forecasting model use?

The forecasting side uses tabular machine learning rather than deep learning.

It includes:

- historical daily bars
- engineered market features
- benchmark context from `SPY` and `QQQ`
- multiple models for comparison
- date-aware validation
- interval output

## Why not just use deep learning?

For this project, a smaller and more explainable pipeline made more sense.

It is easier to test, easier to justify, and easier to discuss clearly than adding a more complex model without being able to explain it properly.

## What is the training universe?

The forecasting model does not train on every symbol in the full catalog. It uses a curated list in `data/training_universe.json`.

That helps keep training manageable and makes the experiment easier to control, although it also introduces limitations such as bias in symbol selection.

## Why are there generated files in `artifacts/`?

The `artifacts/` folder stores outputs from the forecasting pipeline, such as:

- trained models
- metadata
- plots
- evaluation outputs

These are generated files, not hand-written source files.

## Why is the repo split into folders like `routes`, `services`, and `schemas`?

The folders are separated by responsibility:

- `api/routes` for entry points
- `services` for core logic
- `schemas` for request/response shapes
- `orm_models` for database models
- `integrations` for provider-specific code

That makes the project easier to maintain and easier to explain.

## What are the current limitations?

Some current limitations are:

- the forecasting system is still experimental
- the project depends heavily on external market data
- deployment is still being finished
- the system is not meant for real financial advice or live trading use

## What would I improve next?

The next areas I would improve are:

- deployment
- more frontend polish
- better reporting around forecasts
- clearer presentation of model limitations

## What is the simplest way to describe the project?

The shortest description is:

> MarketMetrics is a stock analysis platform that combines user accounts, live market monitoring, historical simulation, short-term forecasting, and long-term projection in one system.
