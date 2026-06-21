#!/usr/bin/env sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-wms-scan}"

cd "$PROJECT_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Create it from .env.production.example before deploying."
  exit 1
fi

if [ -d .git ]; then
  git pull --ff-only
else
  echo "No .git directory found; skipping git pull. Upload or clone the latest code before deploying."
fi

COMPOSE="docker compose -p $COMPOSE_PROJECT_NAME -f $COMPOSE_FILE --env-file $ENV_FILE"

echo "Building production images..."
$COMPOSE build

echo "Running production database migrations..."
$COMPOSE run --rm -e CI=true api sh -lc './node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma'

echo "Starting production stack without orphan containers..."
$COMPOSE up -d --remove-orphans

echo "Current compose services:"
$COMPOSE ps

echo "Container process table:"
$COMPOSE top || true

echo "Checking for development servers outside Docker..."
if ps -eo pid,ppid,comm,args | grep -E 'npm run dev|pnpm dev|vite|nest start|uvicorn|python -m http.server' | grep -v grep; then
  echo "Warning: development server process found. Stop it before treating this host as production."
else
  echo "No Vite/Nest dev server or ad-hoc Python/Uvicorn process detected."
fi

WEB_DOMAIN="$(grep -E '^WEB_DOMAIN=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2- || true)"
if [ -n "$WEB_DOMAIN" ]; then
  echo "Web: https://$WEB_DOMAIN"
  echo "Health check: https://$WEB_DOMAIN/api/v1/health"
else
  echo "Web: http://<server-ip-or-domain>"
  echo "Health check: http://<server-ip-or-domain>/api/v1/health"
fi
