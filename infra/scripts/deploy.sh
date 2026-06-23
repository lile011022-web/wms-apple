#!/usr/bin/env sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_OVERRIDE_FILE="${COMPOSE_OVERRIDE_FILE:-}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-wms-scan}"
DEPLOY_SERVICES="${DEPLOY_SERVICES:-${*:-}}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-auto}"
USE_PREBUILT_IMAGES="${USE_PREBUILT_IMAGES:-false}"

export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"
export COMPOSE_DOCKER_CLI_BUILD="${COMPOSE_DOCKER_CLI_BUILD:-1}"

cd "$PROJECT_DIR"

usage() {
  cat <<'EOF'
Usage:
  PROJECT_DIR=/opt/wms-scan infra/scripts/deploy.sh
  PROJECT_DIR=/opt/wms-scan infra/scripts/deploy.sh web
  PROJECT_DIR=/opt/wms-scan infra/scripts/deploy.sh api
  DEPLOY_SERVICES="web api" PROJECT_DIR=/opt/wms-scan infra/scripts/deploy.sh

Environment:
  RUN_MIGRATIONS=auto|always|never  Defaults to auto. Auto runs migrations for full or api deployments.
  USE_PREBUILT_IMAGES=true          Pull configured images instead of building on the VPS.
  COMPOSE_FILE=<file>               Use docker-compose.prod.images.yml for prebuilt-image deployments.
  COMPOSE_OVERRIDE_FILE=<file>      Optional compose override file.
EOF
}

for service in $DEPLOY_SERVICES; do
  case "$service" in
    web|api) ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unsupported deploy service: $service"
      echo "Supported services: web api"
      exit 1
      ;;
  esac
done

now_seconds() {
  date +%s
}

run_step() {
  step_name="$1"
  shift
  step_start="$(now_seconds)"
  echo "==> $step_name"
  "$@"
  step_end="$(now_seconds)"
  step_elapsed=$((step_end - step_start))
  echo "==> $step_name completed in ${step_elapsed}s"
}

compose() {
  if [ -n "$COMPOSE_OVERRIDE_FILE" ]; then
    docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE_FILE" --env-file "$ENV_FILE" "$@"
  else
    docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Create it from .env.production.example before deploying."
  exit 1
fi

deploy_start="$(now_seconds)"
if [ -n "$DEPLOY_SERVICES" ]; then
  echo "Deploying selected services: $DEPLOY_SERVICES"
else
  echo "Deploying all production services."
fi
if [ "$USE_PREBUILT_IMAGES" = true ]; then
  if [ -z "${WEB_IMAGE:-}" ] || [ -z "${API_IMAGE:-}" ]; then
    echo "USE_PREBUILT_IMAGES=true requires WEB_IMAGE and API_IMAGE."
    exit 1
  fi
  echo "Using prebuilt container images. The VPS will pull images instead of building them."
fi

if [ -d .git ]; then
  run_step "Updating Git checkout" git pull --ff-only
else
  echo "No .git directory found; skipping git pull. Upload or clone the latest code before deploying."
fi

if [ "$USE_PREBUILT_IMAGES" = true ]; then
  if [ -n "$DEPLOY_SERVICES" ]; then
    run_step "Pulling production images: $DEPLOY_SERVICES" compose pull $DEPLOY_SERVICES
  else
    run_step "Pulling production images: all services" compose pull
  fi
else
  if [ -n "$DEPLOY_SERVICES" ]; then
    run_step "Building production images: $DEPLOY_SERVICES" compose build $DEPLOY_SERVICES
  else
    run_step "Building production images: all services" compose build
  fi
fi

should_run_migrations=false
case "$RUN_MIGRATIONS" in
  always)
    should_run_migrations=true
    ;;
  never)
    should_run_migrations=false
    ;;
  auto)
    if [ -z "$DEPLOY_SERVICES" ]; then
      should_run_migrations=true
    else
      for service in $DEPLOY_SERVICES; do
        if [ "$service" = "api" ]; then
          should_run_migrations=true
        fi
      done
    fi
    ;;
  *)
    echo "Unsupported RUN_MIGRATIONS value: $RUN_MIGRATIONS"
    echo "Supported values: auto always never"
    exit 1
    ;;
esac

if [ "$should_run_migrations" = true ]; then
  run_step "Running production database migrations" compose run --rm -e CI=true api sh -lc './node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma'
else
  echo "Skipping production database migrations for this deploy."
fi

echo "Starting production stack without orphan containers..."
if [ -n "$DEPLOY_SERVICES" ]; then
  run_step "Starting selected production services: $DEPLOY_SERVICES" compose up -d --remove-orphans $DEPLOY_SERVICES
else
  run_step "Starting production stack" compose up -d --remove-orphans
fi

echo "Current compose services:"
compose ps

echo "Container process table:"
compose top || true

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

deploy_end="$(now_seconds)"
deploy_elapsed=$((deploy_end - deploy_start))
echo "Deployment completed in ${deploy_elapsed}s."
