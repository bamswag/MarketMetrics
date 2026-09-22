#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if [[ ! -f .env.production ]]; then
    echo "Missing .env.production. Copy .env.production.example and add secrets on the VPS." >&2
    exit 1
fi

if [[ "$(stat -c '%a' .env.production)" != "600" ]]; then
    echo ".env.production must have permissions 600. Run: chmod 600 .env.production" >&2
    exit 1
fi

docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production build --pull app
docker compose --env-file .env.production run --rm app alembic upgrade head
docker compose --env-file .env.production up -d --remove-orphans

echo "Waiting for the application health check..."
for attempt in {1..30}; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' marketmetrics-app-1 2>/dev/null || true)"
    if [[ "$status" == "healthy" ]]; then
        docker compose --env-file .env.production ps
        echo "MarketMetrics is healthy."
        exit 0
    fi
    if [[ "$status" == "unhealthy" ]]; then
        docker compose --env-file .env.production logs --tail=100 app
        echo "MarketMetrics failed its health check." >&2
        exit 1
    fi
    sleep 5
done

docker compose --env-file .env.production logs --tail=100 app
echo "Timed out waiting for MarketMetrics to become healthy." >&2
exit 1
