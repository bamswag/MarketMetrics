# Project Log — MarketMetrics
## A Financial Investment Assistant (CO3201 FYP)

---

## Week 1 [w/c 29/09/2025]

- Clarified project scope with supervisor: educational investment assistant (not trading platform or financial advice).
- Researched retail investment platforms and financial literacy problem; confirmed scope as decision-support + simulation.
- Drafted initial project aims: allow users to explore instruments, simulate historical strategies, forecast short-term prices, project long-term growth.
- Sketched system architecture: FastAPI backend, React frontend, PostgreSQL DB, Render deployment.
- Set up GitHub repository and initial project structure.

---

## Week 2 [w/c 06/10/2025]

- Literature review: reviewed robo-advisors, stock analysis platforms, retail investor tools.
- Identified gap: most platforms don't explain market metrics or strategy differences well for beginners.
- Started requirements analysis: mapped user flows (search → watchlist → alert → simulate → forecast → project).
- Drafted functional requirements covering accounts, market data, alerts, simulations, forecasting, projections.

---

## Week 3 [w/c 13/10/2025]

- Completed requirements specification: 7 major objectives (auth, market data, watchlists, alerts, simulations, forecasting, projections, admin).
- Designed database schema: users, watchlist_items, price_alerts, alert_events, simulation_history.
- Selected tech stack: FastAPI (backend), React 19 (frontend), PostgreSQL (production), SQLite (dev), Alembic (migrations), Pydantic (validation).
- Chose Alpaca IEX feed for market data (free tier sufficient, reliable, covers stocks/ETFs/crypto).

---

## Week 4 [w/c 20/10/2025]

- Designed system architecture: clear separation of routes, services, integrations, ORM models, schemas.
- Planned authentication approach: JWT tokens + Argon2 hashing + Google OAuth + session versioning.
- Drafted alert system: 4 condition types (above, below, percent_change, range_exit), WebSocket evaluation, email notifications.
- Sketched UI wireframes: login/signup, dashboard, instrument detail, search, movers, forecast, projection pages.

---

## Week 5 [w/c 27/10/2025]

- Set up development environment: FastAPI hello-world, Render account, virtual environment, `.env` template.
- Implemented user model and initial auth routes (`/auth/register`, `/auth/login`).
- Added Argon2 password hashing and Pydantic schemas for auth.
- Created first Alembic migration: baseline users table.
- Wrote auth unit tests (registration, password validation).

---

## Week 6 [w/c 03/11/2025]

- Integrated Brevo for transactional email (password reset, email verification).
- Implemented email verification workflow: token generation, verification link, confirmation route.
- Added password reset: forgot-password request, email link, reset with token validation.
- Extended migrations: added reset token and email verification fields to users table.
- Wrote tests for password reset and email verification flows.

---

## Week 7 [w/c 10/11/2025]

- Designed and implemented Google OAuth 2.0: state token generation, Google redirect, callback handling.
- Added account linking: existing users can link Google identity via `googleSubject`.
- Created migration for `primaryAuthProvider` and `googleSubject` fields.
- Tested OAuth flow end-to-end with test credentials.
- Implemented role-based access control: `isAdmin` flag for admin routes.

---

## Week 8 [w/c 17/11/2025]

- Designed price alert system: 4 condition types with Pydantic validation enforcing condition-specific fields.
- Implemented alert CRUD: `POST /alerts`, `GET /alerts`, `PATCH /alerts/{id}`, `DELETE /alerts/{id}`.
- Created `alert_events` table for trigger history; added severity and expiration fields.
- Implemented bulk alert operations: pause, resume, reset, delete in single endpoint.
- Wrote comprehensive alert tests covering all condition types and validations.

---

## Week 9 [w/c 24/11/2025]

- Integrated Alpaca market data API; created alpaca_client service.
- Implemented quote caching with async locking to prevent duplicate API calls.
- Fetched historical OHLCV bars; implemented caching with 1-hour TTL.
- Created symbol catalogue search endpoint with fuzzy matching.
- Tested with real symbols: AAPL, BTC, SPY (worked reliably).

---

## Week 10 [w/c 01/12/2025]

- Implemented `GET /movers` endpoint: top gainers/losers with 5-min caching.
- Created `GET /movers/featured` endpoint: curated mover card with day/week/month filters.
- Implemented watchlist enrichment: fetch quotes and alert counts for each symbol; graceful fallback on API failure.
- Built movers service and tests; updated dashboard wireframe.
- Supervisor feedback: project on track, architecture sound.

---

## Week 11 [w/c 08/12/2025]

- Designed WebSocket architecture: one connection per symbol, 30-second polling, alert evaluation.
- Implemented `WS /ws/quotes/{symbol}` endpoint: authentication, quote polling, alert evaluation.
- Created alert evaluation logic: check all conditions, trigger if met, send email async.
- Added WebSocket connection timeout (30 min), transient error backoff (5s → 15s → 30s).
- Wrote WebSocket tests: authentication, quote streaming, alert evaluation.

---

## Week 12 [w/c 15/12/2025]

- **Issue**: ORM objects become detached in long-lived WebSocket connections after ~30 seconds. Solved by serializing alerts to dicts before returning.
- Implemented investment simulation engine: both buy-and-hold and dollar-cost averaging.
- Designed performance metrics: total return, annualized return, volatility (pstdev), max drawdown, best/worst day.
- Added separate annualization factors: 252 for equities, 365 for crypto.
- Built simulation tests covering both strategies, metrics accuracy, date range validation.

---

## Week 13 [w/c 22/12/2025]

- Designed forecasting pipeline: walk-forward cross-validation to prevent look-ahead bias.
- Implemented Random Forest training script: historical bars → features → model artifacts.
- Created lazy-loading mechanism: ML dependencies only imported on forecast route.
- Designed long-term projection engine: deterministic scenarios + Monte Carlo simulation.
- Created projection schema: assumptions, scenario outputs, P10/P50/P90 confidence bands.

---

## Week 14 [w/c 29/12/2025]

- **Issue**: Walk-forward CV training had leaky train-test split initially. Fixed by shifting test window forward each iteration.
- **Issue**: Forecasting is slow (5–10 seconds per symbol). Accepted trade-off; added loading spinners.
- Implemented admin endpoints: `/admin/users`, `/admin/audit-logs`.
- Created audit logging: records admin actions (user, action, timestamp).
- Added role-based access control: only `isAdmin=true` can access `/admin/*`.

---

## Week 15 [w/c 05/01/2026]

- Initialized React 19 + TypeScript + Vite frontend; created page structure (landing, login, dashboard, etc.).
- Implemented auth pages: login, signup, password reset, email verification, Google OAuth redirect.
- Built API client layer: base URL config, token management, request handling.
- Created routing with React Router v7: protected routes, guest-only routes, lazy loading.
- Implemented basic dashboard layout and components.

---

## Week 16 [w/c 12/01/2026]

- **Issue**: Database migration for new fields caused SQLite compatibility problem. Implemented runtime ALTER TABLE hack with `ensure_user_schema()` (cached per bind).
- **Issue**: Vite bundle was 200KB uncompressed. Optimised with gzip/brotli compression and code splitting for lazy pages.
- Built dashboard components: featured mover card, daily movers, alerts panel, tracked symbols preview.
- Implemented instrument detail page: chart (Recharts), quote, similar instruments, watchlist toggle, alert creation.
- Built search results page with category grouping.

---

## Week 17 [w/c 19/01/2026]

- Built movers direction pages (gainers/losers) with sparkline cards.
- Implemented chart tooltip styling: created shared `ChartTooltip.css` for consistency across pages.
- Built forecast page: input → prediction chart → MAE metric → uncertainty disclaimer.
- Built projection page: assumptions input → scenario table + Monte Carlo chart.
- Implemented watchlist management UI: add/remove buttons, enriched display.

---

## Week 18 [w/c 26/01/2026]

- **Major issue**: Forecast page was slow (5–10 seconds). Profiling showed ML model loading was bottleneck. Added loading spinner; users understand wait on dedicated page.
- **Major issue**: Projection page had similar latency. Added progress indication.
- Built alert creation form with dynamic field validation (condition-specific fields enforced).
- Created projection history page: list, view, edit notes.
- Implemented account/settings pages: profile update, preference management, risk profile selection.

---

## Week 19 [w/c 02/02/2026]

- Built admin pages: user management (view, disable, promote), audit log viewer.
- Implemented SPA fallback: FastAPI serves `frontend/dist/index.html` for unknown routes.
- Configured Render deployment: built React frontend, deployed FastAPI, set environment variables.
- Created database migrations on Render (`alembic upgrade head` on deploy).
- Tested full-stack app on `https://marketmetrics.dev`.

---

## Week 20 [w/c 09/02/2026]

- **Major issue**: Render memory constraint (~512 MB). Memory spiked to 100% when multiple users accessed forecast simultaneously. Solved by lazy-loading ML model per-request (not on startup).
- **Major issue**: API latency on forecast/projection pages caused UI hang. Added async loading + loading spinners; frontend state management became complex.
- Deployed backend-only test service: `https://marketmetrics.onrender.com` (useful for frontend testing).
- Verified database migrations on Render (SQLite dev, PostgreSQL prod both work).
- Began writing comprehensive test suite.

---

## Week 21 [w/c 16/02/2026]

- Wrote backend test suite: 99 passing tests covering auth, alerts, watchlists, simulations, projections, forecasting, WebSocket, search, movers.
- Tested SQLite schema compatibility (all migrations work on both SQLite and PostgreSQL).
- Ran load testing on slow routes; identified in-memory caches as largest memory consumers.
- Reduced cache sizes (quotes: max 1000, bars: max 500) to balance memory vs API calls.
- Manual end-to-end testing on Render: registered account, created watchlist, set alerts, ran simulations.

---

## Week 22 [w/c 23/02/2026]

- **Critical bug fix**: `run_simulation()` was awaiting synchronous `fetch_company_name()`, causing HTTP 500 on every `/simulate` call. Removed spurious `await`. Updated tests (MagicMock instead of AsyncMock).
- **Security hardening**: Added JWT production guard (backend refuses to start on Render if `JWT_SECRET` is empty or `"change-me"`).
- Reduced PII in logs: changed WebSocket handler to log `userID` instead of `email`; removed password reset token hashes from debug logs.
- **WebSocket error isolation**: outer exception handler sends generic error to browser instead of `str(e)`.
- Supervisor check-in: project on track for submission.

---

## Week 23 [w/c 02/03/2026]

- **Major issue**: Frontend rerendering on dashboard. Alerts panel flickered on parent state change. Fixed with `useCallback()` and `React.memo()` to prevent unnecessary rerenders.
- **Data leakage bug**: Stale frontend state appearing in wrong view context (e.g., old alert data showing in search). Traced to shared state in AppRouter; moved to context provider. Now each view gets fresh data on navigation.
- Optimised API calls: added request deduplication (same request within 100ms skips duplicate).
- Added loading states to slow pages.
- Profiled and optimised memory usage: reduced cache footprint, added TTL bounds.

---

## Week 24 [w/c 09/03/2026]

- Comprehensive manual testing: all workflows (auth, search, watchlist, alerts, simulations, forecasting, projections, admin).
- Edge case testing: invalid inputs, missing data, boundary conditions (1-day vs 10-year simulations).
- **Remaining latency**: Forecast page still ~8–10 seconds (acceptable given ML compute). Documented as limitation.
- Finalised codebase: comments, cleaned up debug logs, removed TODOs.
- Updated README.md, DEPLOYMENT.md, PROJECTLOG.md.
- **Final deployment**: `https://marketmetrics.dev` live and stable. 99/99 tests passing.
- **Submission ready**: codebase, documentation, test suite, deployment guide prepared.

---

## Key Technical Achievements

- **Auth System**: Email/password + Argon2 + JWT + session versioning + Google OAuth + 2-step workflows (email verification, password reset)
- **Market Data Integration**: Alpaca IEX feed, real-time quotes via WebSocket (30s polling), caching strategy (30s quotes, 1h bars)
- **Alert System**: 4 condition types, Pydantic validation, trigger history, bulk operations, near-real-time evaluation
- **Investment Analysis**: Buy-and-hold + DCA simulations, Random Forest forecasting (walk-forward CV), Monte Carlo projections, deterministic scenarios
- **Full-Stack Deployment**: Render web service, PostgreSQL 18, Alembic migrations (11 revisions), SPA fallback serving
- **Test Coverage**: 99 backend tests covering all major features; SQLite/PostgreSQL compatibility verified

---

## Known Limitations (Documented)

- No frontend automated tests (future work)
- No CI/CD pipeline (manual deploys)
- No API rate limiting (future work)
- Alerts only evaluate during active WebSocket sessions (no background worker)
- WebSocket polling (30s ticks), not true exchange streaming
- Forecast artifacts ephemeral on Render (no persistent storage)
- Simulations omit tax, transaction costs, FX, dividends
- Forecasts and projections are educational, not financial advice
- In-memory caches not distributed (single Render instance)

---

## Future Improvements

- Rate limiting on registration, login, forecast, projection routes
- Frontend test suite (React Testing Library or Playwright)
- CI/CD pipeline (GitHub Actions)
- Persistent forecast artifacts (Render Disk or S3)
- Background worker for 24/7 alert monitoring
- Enhanced simulation modelling (transaction costs, taxes)
- Better forecasting models (LSTM, Transformer, ensemble)
