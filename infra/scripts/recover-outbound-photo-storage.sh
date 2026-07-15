#!/usr/bin/env sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.images.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-wms-scan}"
API_CONTAINER="${API_CONTAINER:-wms-scan-api}"
WEB_CONTAINER="${WEB_CONTAINER:-wms-scan-web}"
UPLOAD_DIR="${UPLOAD_DIR:-uploads}"
PHOTO_DIR="$UPLOAD_DIR/outbound-box-photos"

cd "$PROJECT_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE."
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing $COMPOSE_FILE."
  exit 1
fi

if [ ! -d "$PHOTO_DIR" ]; then
  echo "Missing photo directory: $PHOTO_DIR"
  exit 1
fi

count_files() {
  find "$1" -type f | wc -l | tr -d ' '
}

HOST_PHOTO_COUNT="$(count_files "$PHOTO_DIR")"
if [ "$HOST_PHOTO_COUNT" -eq 0 ]; then
  echo "No host photos found in $PHOTO_DIR; refusing to recreate the API container."
  exit 1
fi

API_IMAGE="${API_IMAGE:-$(docker inspect --format '{{.Config.Image}}' "$API_CONTAINER")}"
WEB_IMAGE="${WEB_IMAGE:-$(docker inspect --format '{{.Config.Image}}' "$WEB_CONTAINER")}"
export API_IMAGE WEB_IMAGE

echo "Host photo count before recovery: $HOST_PHOTO_COUNT"
echo "Reusing API image: $API_IMAGE"
echo "Reusing web image: $WEB_IMAGE"

PROJECT_DIR="$PROJECT_DIR" \
  ENV_FILE="$ENV_FILE" \
  COMPOSE_FILE="$COMPOSE_FILE" \
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  UPLOAD_DIR="$UPLOAD_DIR" \
  infra/scripts/backup-postgres.sh

docker compose \
  -p "$COMPOSE_PROJECT_NAME" \
  -f "$COMPOSE_FILE" \
  --env-file "$ENV_FILE" \
  up -d --no-deps --force-recreate api

EXPECTED_MOUNT_SOURCE="$PROJECT_DIR/$UPLOAD_DIR"
ACTUAL_MOUNT_SOURCE="$(
  docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/apps/api/uploads"}}{{.Source}}{{end}}{{end}}' "$API_CONTAINER"
)"

if [ "$ACTUAL_MOUNT_SOURCE" != "$EXPECTED_MOUNT_SOURCE" ]; then
  echo "Unexpected API upload mount: ${ACTUAL_MOUNT_SOURCE:-missing}"
  echo "Expected: $EXPECTED_MOUNT_SOURCE"
  exit 1
fi

CONTAINER_PHOTO_COUNT="$(
  docker exec "$API_CONTAINER" sh -lc \
    'find /app/apps/api/uploads/outbound-box-photos -type f | wc -l | tr -d " "'
)"

if [ "$CONTAINER_PHOTO_COUNT" != "$HOST_PHOTO_COUNT" ]; then
  echo "Photo count mismatch after recovery."
  echo "Host: $HOST_PHOTO_COUNT"
  echo "Container: $CONTAINER_PHOTO_COUNT"
  exit 1
fi

POSTGRES_DB="$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2-)"
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2-)"
DB_PHOTO_COUNT="$(
  docker compose \
    -p "$COMPOSE_PROJECT_NAME" \
    -f "$COMPOSE_FILE" \
    --env-file "$ENV_FILE" \
    exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
    'SELECT COUNT(*) FROM outbound_box_photos;'
)"

HEALTH_URL="http://127.0.0.1/api/v1/health"
attempt=1
while [ "$attempt" -le 20 ]; do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 20 ]; then
    echo "API health check failed after container recreation."
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

SAMPLE_PHOTO_URL="$(
  docker compose \
    -p "$COMPOSE_PROJECT_NAME" \
    -f "$COMPOSE_FILE" \
    --env-file "$ENV_FILE" \
    exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
    'SELECT "fileUrl" FROM outbound_box_photos ORDER BY "createdAt" DESC LIMIT 1;'
)"

if [ -n "$SAMPLE_PHOTO_URL" ]; then
  SAMPLE_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1$SAMPLE_PHOTO_URL")"
else
  SAMPLE_STATUS="no-database-photo"
fi

echo "Recovery verification complete."
echo "Upload mount: $ACTUAL_MOUNT_SOURCE -> /app/apps/api/uploads"
echo "Host photo count: $HOST_PHOTO_COUNT"
echo "Container photo count: $CONTAINER_PHOTO_COUNT"
echo "Database photo count: $DB_PHOTO_COUNT"
echo "Sample photo status: $SAMPLE_STATUS"
echo "Health: ok"
