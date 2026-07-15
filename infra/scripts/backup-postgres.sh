#!/usr/bin/env sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-wms-scan}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
UPLOAD_DIR="${UPLOAD_DIR:-uploads}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

cd "$PROJECT_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. The backup script needs the production environment file."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

POSTGRES_DB="$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2-)"
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2-)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/wms-postgres-$TIMESTAMP.sql.gz"
TEMP_FILE="$BACKUP_DIR/wms-postgres-$TIMESTAMP.sql"
UPLOAD_BACKUP_FILE="$BACKUP_DIR/wms-uploads-$TIMESTAMP.tar.gz"

docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$TEMP_FILE"

gzip -f "$TEMP_FILE"

if [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$UPLOAD_BACKUP_FILE" "$UPLOAD_DIR"
  echo "Upload backup saved to $UPLOAD_BACKUP_FILE"
else
  echo "Upload directory $UPLOAD_DIR does not exist; skipping upload backup."
fi

find "$BACKUP_DIR" -type f -name 'wms-postgres-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name 'wms-uploads-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

echo "PostgreSQL backup saved to $BACKUP_FILE"
echo "Retention: keeping database and upload backups from the last $RETENTION_DAYS days."
