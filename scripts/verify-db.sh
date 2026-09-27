#!/usr/bin/env bash
# Applies all migrations to a throwaway vanilla Postgres 17 (with a stub of the
# Supabase auth schema/roles) and runs the SQL security test-suite.
#
#   ./scripts/verify-db.sh                       # spins up an ephemeral container
#   PG_CONTAINER=my-pg ./scripts/verify-db.sh    # reuse a running container
#   DATABASE_URL=postgres://... ./scripts/verify-db.sh   # CI service container (needs local psql)
#
# Requires Docker (or Podman aliased as docker) unless DATABASE_URL is set.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)
  run() { echo "→ $1"; "${PSQL[@]}" < "$1"; }
  run supabase/tests/stub_supabase.sql
  for f in supabase/migrations/*.sql; do run "$f"; done
  run supabase/tests/economy_security.test.sql
  exit 0
fi

CONTAINER="${PG_CONTAINER:-}"
OWNED=0
if [[ -z "$CONTAINER" ]]; then
  CONTAINER="lifegame-verify-$$"
  OWNED=1
  docker create --name "$CONTAINER" -e POSTGRES_PASSWORD=verify docker.io/library/postgres:17-alpine >/dev/null
  docker start "$CONTAINER" >/dev/null
fi

cleanup() { if [[ "$OWNED" == 1 ]]; then docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT

for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
# pg_isready can succeed during the init-restart; wait for a real query.
for _ in $(seq 1 30); do
  docker exec "$CONTAINER" psql -U postgres -c 'select 1' >/dev/null 2>&1 && break
  sleep 1
done

DB="lifegame_verify"
PSQL=(docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c "drop database if exists $DB" >/dev/null
"${PSQL[@]}" -c "create database $DB" >/dev/null

run() { echo "→ $1"; "${PSQL[@]}" -d "$DB" < "$1"; }

run supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do run "$f"; done
run supabase/tests/economy_security.test.sql
