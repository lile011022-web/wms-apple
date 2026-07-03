# Low-Cost VPS Deployment

## Goal

This deployment skeleton is for internal testing of WMS Scan with US warehouse colleagues. It uses one US VPS, Docker Compose, PostgreSQL, Redis, NestJS API, and an nginx-served React/Vite frontend.

Public traffic enters nginx on ports 80 and later 443. nginx serves the frontend and forwards `/api` requests to the internal API container. PostgreSQL, Redis, and the API service are not exposed to the public internet.

## Recommended VPS

- Region: United States, close to the testing warehouse or colleagues.
- CPU: 2 vCPU minimum.
- Memory: 4 GB minimum for internal testing.
- Disk: 60 GB SSD minimum; increase if report exports or backups grow.
- OS: Ubuntu 24.04 LTS or Ubuntu 22.04 LTS.
- Network: public IPv4, with DNS managed through Cloudflare if possible.

## Server Initialization

Log in as a sudo-capable user:

```bash
ssh <vps-user>@<vps-host>
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw
```

Current internal-test VPS:

```bash
ssh -i ~/.ssh/wms_scan_do -o IdentitiesOnly=yes root@147.182.133.230
```

Current project directory:

```text
/opt/wms-scan
```

Current DigitalOcean Droplet:

```text
ubuntu-s-2vcpu-4gb-120gb-intel-nyc1
Public IPv4: 147.182.133.230
```

2026-06-30 verification:

- `http://147.182.133.230/api/v1/health` returned WMS health `status: ok`; this is the current deployment target.
- `http://147.182.186.0/api/v1/health` did not return normal WMS health; do not deploy there unless it is intentionally promoted.
- `http://24.199.87.181/api/v1/health` may still respond from the legacy server. Keep it until database backups, routing, and production data ownership are confirmed, then retire it through the cloud provider console.

Create an application directory:

```bash
sudo mkdir -p /opt/wms-scan
sudo chown "$USER":"$USER" /opt/wms-scan
```

## Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker version
docker compose version
```

## Firewall

Only SSH, HTTP, and HTTPS should be open:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

PostgreSQL, Redis, and API ports must stay closed to the public internet. The production compose file does not publish those ports.

## Clone Repository

```bash
cd /opt/wms-scan
git clone <github-repository-url> .
```

Use the real repository URL on the VPS. Do not put tokens or passwords into shell history.

## Create Production Environment

Copy the template and edit values on the server:

```bash
cp .env.production.example .env.production
nano .env.production
```

Required placeholders to replace:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `WEB_DOMAIN`
- `WEB_ORIGIN`

Example domain placeholders should stay non-real in committed files. The actual `.env.production` file must never be committed.

The current backend reads `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. `JWT_SECRET` is kept in the template as a compatibility placeholder for future simplification or third-party tooling.

## Start Production

```bash
PROJECT_DIR=/opt/wms-scan infra/scripts/deploy.sh
```

The production frontend is built by the Docker image and served from nginx. Do not run `npm run dev`, `pnpm dev`, or Vite directly on the VPS.

Health check:

```bash
curl http://localhost/api/v1/health
```

When DNS is ready:

```bash
curl https://wms.example.com/api/v1/health
```

Replace `wms.example.com` with the real internal-test domain on the server only.

## Logs

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f web
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f postgres
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f redis
```

## Stop Services

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production down
```

This stops containers but keeps named volumes. Do not delete Docker volumes unless you intentionally want to remove the database.

## Update Services

Use the deploy script after reviewing the current branch:

```bash
chmod +x infra/scripts/deploy.sh
PROJECT_DIR=/opt/wms-scan infra/scripts/deploy.sh
```

The script runs `git pull --ff-only` when the server has a Git checkout, builds production images, runs Prisma migrations from a one-off API container, starts the stack with `docker compose up -d --remove-orphans`, prints container status, and prints the web and health-check URLs. Each major step prints elapsed seconds so slow deploys can be traced to Git update, image build or pull, Prisma migration, or container restart.

For smaller changes, deploy only the affected service:

```bash
# Frontend-only page or style change.
PROJECT_DIR=/opt/wms-scan infra/scripts/deploy.sh web

# API, Prisma, migration, or backend-only change.
PROJECT_DIR=/opt/wms-scan infra/scripts/deploy.sh api
```

`RUN_MIGRATIONS=auto` is the default. It runs Prisma migrations during full deployments and `api` deployments, but skips them for `web` deployments. Use `RUN_MIGRATIONS=always` or `RUN_MIGRATIONS=never` only when the release scope explicitly requires that override.

Docker BuildKit is enabled by default in the deploy script. The production Dockerfiles use persistent BuildKit cache mounts for the pnpm store, so repeated VPS builds should spend less time downloading packages after the first cached build.

Because the script always uses the same compose project name (`wms-scan`), repeated deployments restart or replace the existing containers instead of creating duplicate long-running Node, npm, Python, or Vite processes.

The current VPS directory was uploaded as a working tree without `.git`, so Codex should sync the local checkout to `/opt/wms-scan` first, preserving `.env.production`, `backups/`, and Docker volumes. After syncing, run:

```bash
PROJECT_DIR=/opt/wms-scan infra/scripts/backup-postgres.sh
PROJECT_DIR=/opt/wms-scan infra/scripts/deploy.sh
curl http://147.182.133.230/api/v1/health
```

## Prebuilt Image Deployments

For faster releases on the small VPS, build images outside the server and publish these GHCR images:

```text
ghcr.io/<owner>/<repo>/api:<tag>
ghcr.io/<owner>/<repo>/web:<tag>
```

On the server, set the image names in `.env.production`:

```bash
WEB_IMAGE=ghcr.io/<owner>/<repo>/web:<tag>
API_IMAGE=ghcr.io/<owner>/<repo>/api:<tag>
```

Then deploy by pulling images instead of building on the VPS:

```bash
USE_PREBUILT_IMAGES=true \
COMPOSE_FILE=docker-compose.prod.images.yml \
PROJECT_DIR=/opt/wms-scan \
infra/scripts/deploy.sh
```

This path still uses the same database backup, Prisma migration, container restart, and health-check expectations. It only moves the expensive Node/Docker build work away from the low-cost VPS.

Check for duplicate or development-mode processes after a deploy:

```bash
cd /opt/wms-scan
docker compose -p wms-scan -f docker-compose.prod.yml --env-file .env.production ps
docker compose -p wms-scan -f docker-compose.prod.yml --env-file .env.production top
ps -eo pid,ppid,comm,args | grep -E 'npm run dev|pnpm dev|vite|nest start|uvicorn|python -m http.server' | grep -v grep
```

The last command should return no rows on production.

## Rollback

For a simple internal test rollback:

```bash
git log --oneline -5
git checkout <previous-good-commit>
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

For database-sensitive releases, create a backup before updating. Schema migrations should have an explicit rollback note before they are run on the VPS.

## Direct Database Access

PostgreSQL is intentionally available only on the Docker internal network. Do not publish port `5432` to the public internet. To inspect or update data directly, use SSH and run `psql` inside the PostgreSQL container:

```bash
ssh -i ~/.ssh/wms_scan_do -o IdentitiesOnly=yes root@147.182.133.230
cd /opt/wms-scan
docker compose -p wms-scan -f docker-compose.prod.yml --env-file .env.production exec postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

For one-off SQL:

```bash
docker compose -p wms-scan -f docker-compose.prod.yml --env-file .env.production exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) from products;"'
```

Create a backup before manual writes:

```bash
PROJECT_DIR=/opt/wms-scan infra/scripts/backup-postgres.sh
```

## Database Backup

Run a compressed PostgreSQL backup:

```bash
chmod +x infra/scripts/backup-postgres.sh
PROJECT_DIR=/opt/wms-scan infra/scripts/backup-postgres.sh
```

Backups are saved under:

```text
backups/wms-postgres-YYYYMMDD-HHMMSS.sql.gz
```

The script keeps the last 30 days by default:

```bash
RETENTION_DAYS=30 infra/scripts/backup-postgres.sh
```

Later, this script can upload backup files to Cloudflare R2 or another object storage bucket after local backup creation succeeds.

## Cloudflare DNS

1. Add the real domain to Cloudflare.
2. Create an `A` record for the test hostname, for example `wms`, pointing to the VPS public IPv4.
3. Keep the record proxied if you want Cloudflare protection in front of the VPS.
4. Configure TLS after the domain resolves. This skeleton starts with port 80; HTTPS can be added through host-level Certbot, a Caddy replacement, or a future nginx TLS config.

## Future Cloudflare Access

Cloudflare Access can protect the internal test entry before traffic reaches the VPS:

1. Create a Cloudflare Zero Trust application for the WMS hostname.
2. Allow only company email accounts or a test user group.
3. Keep `/api` under the same protected hostname unless mobile scanner devices need a separate policy.
4. Test login and token refresh flows after Access is enabled.

## US Colleague Test Flow

1. Open the shared internal-test URL.
2. Log in with the seeded test account provided through a secure channel.
3. Confirm Dashboard loads.
4. Test customer setup, UPC lookup, inbound scan, inbound records, customer inventory, outbound packing, exception handling, batch customer change, and detail download with non-production test data.
5. Report the page URL, test account role, timestamp, scanned value, expected result, and actual result for each issue.

Do not enter real customer data, real production passwords, or irreversible warehouse records during this low-cost internal test stage.

## Local Verification

From the repository root:

```bash
cp .env.production.example .env.production
# Edit .env.production and keep only placeholder-safe local values.
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker ps
```

Open:

```text
http://localhost/
http://localhost/api/v1/health
```

Stop local production containers:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production down
```
