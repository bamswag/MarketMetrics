# MarketMetrics Production Deployment

This document describes the current MarketMetrics production deployment on an OVHcloud VPS. Render was used earlier in the project but is no longer part of the production request path.

Live site: **https://marketmetrics.dev**

## 1. Production Architecture

```text
Browser
  │ HTTPS / WebSocket
  ▼
Caddy container
  │ reverse proxy over the private Docker network
  ▼
FastAPI application container
  ├─ serves the compiled React SPA
  ├─ exposes the REST and WebSocket routes
  ├─ calls Alpaca, Google OAuth and Brevo
  └─ connects to PostgreSQL over the private Docker network
                         │
                         ▼
                 PostgreSQL 18 container
                 persistent Docker volume
```

The deployment consists of three Docker Compose services:

| Service | Image | Purpose | Public ports |
|---|---|---|---|
| `caddy` | `caddy:2-alpine` | TLS termination, security headers and reverse proxy | `80`, `443` |
| `app` | Built from `Dockerfile` | React production build and FastAPI application | None |
| `db` | `postgres:18.6-alpine` | Production PostgreSQL database | None |

Only Caddy is exposed to the internet. The application and database communicate through Docker's private network. PostgreSQL must never publish port `5432` on the host.

Production data is stored in the named volume `marketmetrics_postgres_data`. Removing that volume destroys the production database.

## 2. Repository and Server Layout

The deployment source is the GitHub repository:

```text
https://github.com/bamswag/MarketMetrics
```

The production checkout is stored at `/opt/marketmetrics`. The secrets file exists only on the VPS at `/opt/marketmetrics/.env.production`. It must be owned by the deployment user, have mode `600`, and remain excluded from Git.

Database dumps are stored outside the repository at `/opt/marketmetrics-backups`. Backups must also be copied off the VPS. A backup on the same disk is not sufficient protection against disk or server loss.

## 3. Host Prerequisites

The current host runs Ubuntu with Docker Engine and Docker Compose. Before deployment, confirm:

```bash
docker version
docker compose version
free -h
df -h /
```

Host security requirements:

- SSH key authentication only.
- Root and password SSH login disabled.
- UFW permits only SSH, HTTP and HTTPS.
- Fail2ban enabled.
- At least 2 GB swap available.
- Docker enabled at boot.

Example checks:

```bash
sudo ufw status verbose
sudo systemctl status fail2ban --no-pager
sudo systemctl is-enabled docker
swapon --show
```

## 4. Production Configuration

Create the environment file from the tracked example:

```bash
cd /opt/marketmetrics
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

The production database URL uses the Compose service name `db`:

```env
APP_ENV=production
DATABASE_URL=postgresql://marketmetrics:STRONG_DATABASE_PASSWORD@db:5432/marketmetrics
POSTGRES_DB=marketmetrics
POSTGRES_USER=marketmetrics
POSTGRES_PASSWORD=STRONG_DATABASE_PASSWORD
```

Generate independent secrets instead of reusing passwords:

```bash
openssl rand -hex 32
```

Required application values include:

```env
JWT_SECRET=AN_INDEPENDENT_RANDOM_SECRET
FRONTEND_BASE_URL=https://marketmetrics.dev
GOOGLE_OAUTH_REDIRECT_URI=https://marketmetrics.dev/auth/google/callback
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
BREVO_API_KEY=...
EMAIL_FROM_ADDRESS=...
```

Never commit real database URLs, passwords, OAuth secrets, email-provider keys or market-data keys.

## 5. First Deployment

Clone the repository and create the protected environment file before starting the stack. Start PostgreSQL first and wait for it to become healthy:

```bash
cd /opt/marketmetrics
docker compose --env-file .env.production up -d db
docker compose --env-file .env.production ps db
```

Apply migrations, build the application and start the complete stack:

```bash
docker compose --env-file .env.production run --rm app alembic upgrade head
docker compose --env-file .env.production build --pull app
docker compose --env-file .env.production up -d --remove-orphans
```

The helper script performs configuration validation, builds the application, applies migrations, starts the services and waits for the application health check:

```bash
./scripts/deploy_ovh.sh
```

On a completely new server, start `db` before running the helper script.

## 6. Regular Deployment

From the VPS checkout:

```bash
cd /opt/marketmetrics
git pull --ff-only
./scripts/deploy_ovh.sh
```

After deployment, verify:

```bash
docker compose --env-file .env.production ps
curl -fsS https://marketmetrics.dev/health
```

Expected response:

```json
{"status":"ok","database":true}
```

The application refuses to start in production if `DATABASE_URL` is missing or `JWT_SECRET` is missing, insecure or still a template value.

## 7. DNS and HTTPS

Namecheap DNS points the domain to the OVH VPS:

| Type | Host | Target |
|---|---|---|
| A | `@` | OVH VPS IPv4 address |
| CNAME | `www` | `marketmetrics.dev` |

Brevo DKIM and domain-verification records must remain in place.

`Caddyfile` declares both `marketmetrics.dev` and `www.marketmetrics.dev`. Caddy obtains and renews TLS certificates automatically, adds security headers and proxies requests to `app:8000`.

Useful checks:

```bash
dig marketmetrics.dev A +short
dig www.marketmetrics.dev CNAME +short
curl -I https://marketmetrics.dev
curl -I https://www.marketmetrics.dev
docker compose --env-file .env.production logs --tail=100 caddy
```

## 8. Database Operations

### Migrations

Alembic owns the schema:

```bash
docker compose --env-file .env.production run --rm app alembic current
docker compose --env-file .env.production run --rm app alembic upgrade head
```

The current production revision is `20260425_0011`.

### Database access

Access PostgreSQL from inside its container:

```bash
docker compose --env-file .env.production exec db \
  sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Do not add a Compose `ports` mapping for PostgreSQL. Administrative access should use `docker compose exec` or an SSH tunnel.

### Manual backup

Create a custom-format logical backup:

```bash
sudo install -d -m 700 -o ubuntu -g ubuntu /opt/marketmetrics-backups
umask 077

docker compose --env-file .env.production exec -T db \
  sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > /opt/marketmetrics-backups/marketmetrics-$(date +%F-%H%M%S).dump

chmod 600 /opt/marketmetrics-backups/*.dump
```

Validate a dump before relying on it:

```bash
docker run --rm \
  -v /opt/marketmetrics-backups:/backups:ro \
  postgres:18.6-alpine \
  pg_restore --list /backups/NAME_OF_BACKUP.dump
```

### Restore

Restoring overwrites database state and should only be performed during a planned maintenance window. First stop application writes and take a new backup of the current database. Then replace the database and restore the selected archive:

```bash
docker compose --env-file .env.production stop app

docker compose --env-file .env.production exec db \
  sh -ec 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"'

docker compose --env-file .env.production exec db \
  sh -ec 'createdb -U "$POSTGRES_USER" -T template0 "$POSTGRES_DB"'

docker compose --env-file .env.production exec -T db \
  sh -ec 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error' \
  < /opt/marketmetrics-backups/NAME_OF_BACKUP.dump

docker compose --env-file .env.production exec db \
  sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "ANALYZE;"'

docker compose --env-file .env.production up -d --force-recreate app
```

Verify the Alembic revision, important row counts, `/health`, authentication and a database write before declaring the restore complete.

Keep at least one encrypted off-server copy of recent backups. Automated backup scheduling and restore testing are required operational improvements.

## 9. Migration from Neon

Production PostgreSQL was migrated from Neon to the private OVH PostgreSQL 18 service using:

1. A custom-format `pg_dump` from Neon's direct, non-pooled connection.
2. A rehearsal restore while the application continued using Neon.
3. Schema revision and row-count verification.
4. A short write freeze.
5. A final dump and restore with `pg_restore`.
6. A `DATABASE_URL` change from Neon to `db:5432`.
7. Health, authentication, admin and database-write checks.

Neon is not in the current production request path. It should be retained temporarily after migration as a rollback source, then retired only after OVH backups and restore procedures have been proven.

## 10. Authentication and External Services

### Google OAuth

The authorised redirect URI in Google Cloud must be:

```text
https://marketmetrics.dev/auth/google/callback
```

### Brevo

Brevo sends verification and password-reset email. The sender must be verified, and its DNS verification and DKIM records must remain configured.

### Alpaca

Alpaca provides quotes, historical bars, snapshots, movers and asset metadata. The default production feed is IEX.

## 11. Administrator Provisioning

Administrator credentials are not stored in source control. A user must first register normally, after which the existing account can be promoted from the application container:

```bash
docker compose --env-file .env.production exec app \
  python scripts/create_admin.py --email your-admin-email@example.com
```

The script does not create accounts or passwords. Promotion invalidates existing sessions, so the user must sign in again.

## 12. Monitoring and Troubleshooting

Check service status and recent logs:

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 app
docker compose --env-file .env.production logs --tail=100 caddy
docker compose --env-file .env.production logs --tail=100 db
```

Confirm the application is using the private database without printing credentials:

```bash
docker compose --env-file .env.production exec app python -c \
'import os; from sqlalchemy.engine import make_url; print(make_url(os.environ["DATABASE_URL"]).host)'
```

Expected output: `db`.

Common failure categories:

- **Caddy is restarting:** validate `Caddyfile` and inspect Caddy logs.
- **Database health is false:** check `db` health, PostgreSQL logs and `DATABASE_URL`.
- **OAuth callback fails:** verify the exact Google redirect URI and production base URL.
- **Email is not sent:** verify the Brevo key, sender address and DNS records.
- **Market data fails:** verify Alpaca credentials, feed and provider status.
- **Forecast route fails:** verify that the active model artifacts exist inside the application image.

## 13. Security and Operational Limitations

Current protections include TLS, security headers, UFW, Fail2ban, SSH keys, Argon2 password hashing, JWT session invalidation, role-based admin access and a non-public database.

The deployment is appropriate for a final-year project, but it is not a highly available commercial platform:

- The VPS is a single point of failure.
- PostgreSQL has no replica or automatic failover.
- Automated off-server backups and restore drills still need to be established.
- Application monitoring and alerting are limited.
- Deployments are manual; there is no CI/CD pipeline.
- API rate limiting is not implemented.
- In-memory caches are local to the single application process.
- Alert evaluation depends on active WebSocket sessions.
- Runtime-generated forecast artifacts are not stored in a dedicated persistent artifact store.

## 14. Production Checklist

Before and after each deployment:

- [ ] `.env.production` exists, has mode `600` and contains no template values.
- [ ] PostgreSQL is healthy and exposes only `5432/tcp` internally.
- [ ] Alembic reports the expected head revision.
- [ ] App and Caddy containers are healthy/running.
- [ ] `https://marketmetrics.dev/health` returns HTTP 200 and `database: true`.
- [ ] Root and `www` domains have valid HTTPS.
- [ ] Login, Google OAuth, admin access and a database write work.
- [ ] A recent database backup exists and has been copied off the VPS.
- [ ] No secrets have been printed, committed or included in screenshots.
