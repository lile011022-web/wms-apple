#!/usr/bin/env sh
set -eu

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.images.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-wms-scan}"
UPLOAD_DIR="${UPLOAD_DIR:-uploads}"
PHOTO_DIR="$UPLOAD_DIR/outbound-box-photos"
BACKUP_DIR="${BACKUP_DIR:-backups}"

cd "$PROJECT_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE."
  exit 1
fi

POSTGRES_DB="$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2-)"
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2-)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_FILE="$BACKUP_DIR/outbound-photo-audit-$TIMESTAMP.txt"
DB_ROWS_FILE="$(mktemp)"
OTHER_FILES_FILE="$(mktemp)"
trap 'rm -f "$DB_ROWS_FILE" "$OTHER_FILES_FILE"' EXIT

mkdir -p "$BACKUP_DIR"

docker compose \
  -p "$COMPOSE_PROJECT_NAME" \
  -f "$COMPOSE_FILE" \
  --env-file "$ENV_FILE" \
  exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' -c \
  'SELECT id, "fileUrl", "createdAt" FROM outbound_box_photos ORDER BY "createdAt";' \
  >"$DB_ROWS_FILE"

HOST_PHOTO_COUNT="$(find "$PHOTO_DIR" -type f | wc -l | tr -d ' ')"
DB_PHOTO_COUNT=0
AVAILABLE_RECORD_COUNT=0
MISSING_RECORD_COUNT=0
SAMPLE_AVAILABLE_URL=""
SAMPLE_MISSING_URL=""

{
  echo "Outbound photo storage audit: $TIMESTAMP"
  echo
  echo "Missing database-backed files:"
} >"$REPORT_FILE"

while IFS='|' read -r photo_id file_url created_at; do
  [ -n "$photo_id" ] || continue
  DB_PHOTO_COUNT=$((DB_PHOTO_COUNT + 1))
  relative_path="${file_url#/}"
  if [ -f "$PROJECT_DIR/$relative_path" ]; then
    AVAILABLE_RECORD_COUNT=$((AVAILABLE_RECORD_COUNT + 1))
    if [ -z "$SAMPLE_AVAILABLE_URL" ]; then
      SAMPLE_AVAILABLE_URL="$file_url"
    fi
  else
    MISSING_RECORD_COUNT=$((MISSING_RECORD_COUNT + 1))
    if [ -z "$SAMPLE_MISSING_URL" ]; then
      SAMPLE_MISSING_URL="$file_url"
    fi
    echo "$photo_id|$created_at|$file_url" >>"$REPORT_FILE"
  fi
done <"$DB_ROWS_FILE"

find /opt /var/lib/docker \
  -type f \
  -path '*/outbound-box-photos/*' \
  ! -path "$PROJECT_DIR/$PHOTO_DIR/*" \
  -print 2>/dev/null >"$OTHER_FILES_FILE" || true
OTHER_COPY_COUNT="$(wc -l <"$OTHER_FILES_FILE" | tr -d ' ')"

AVAILABLE_STATUS="not-tested"
if [ -n "$SAMPLE_AVAILABLE_URL" ]; then
  AVAILABLE_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1$SAMPLE_AVAILABLE_URL")"
fi

MISSING_STATUS="not-tested"
if [ -n "$SAMPLE_MISSING_URL" ]; then
  MISSING_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1$SAMPLE_MISSING_URL")"
fi

{
  echo
  echo "Summary:"
  echo "Host photo files: $HOST_PHOTO_COUNT"
  echo "Database photo records: $DB_PHOTO_COUNT"
  echo "Records with files: $AVAILABLE_RECORD_COUNT"
  echo "Records missing files: $MISSING_RECORD_COUNT"
  echo "Other host or Docker photo copies: $OTHER_COPY_COUNT"
  echo "Available sample HTTP status: $AVAILABLE_STATUS"
  echo "Missing sample HTTP status: $MISSING_STATUS"
  if [ "$OTHER_COPY_COUNT" -gt 0 ]; then
    echo
    echo "Other host or Docker photo copies:"
    cat "$OTHER_FILES_FILE"
  fi
} >>"$REPORT_FILE"

cat "$REPORT_FILE"
echo "Audit report saved to $REPORT_FILE"
