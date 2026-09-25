#!/usr/bin/env bash
#
# db-snapshot.sh — copia las tablas DEPORTIVAS de Supabase a db/init/
#
#   db/init/01_schema.sql  → schema-only (se commitea, no tiene datos)
#   db/init/02_seed.sql    → data-only   (gitignored)
#
# Nunca exporta datos personales: newsletter_subscribers, email_logs, articles.
#
# Uso:
#   SUPABASE_DB_URL=postgresql://... ./scripts/db-snapshot.sh
#   (o definiendo SUPABASE_DB_URL en el .env de la raíz)
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/db/init"
SCHEMA_FILE="$OUT_DIR/01_schema.sql"
SEED_FILE="$OUT_DIR/02_seed.sql"
ENV_FILE="$ROOT_DIR/.env"

# Tablas deportivas. NO incluir newsletter_subscribers / email_logs / articles.
TABLES=(
  constructors
  drivers
  driver_seasons
  races
  results
  qualifying
  sprint_results
  sprint_qualifying
  race_strategies
  practices
)

# Tablas que jamás pueden aparecer en el dump de datos.
FORBIDDEN=(newsletter_subscribers email_logs articles)

# ── 1. Cargar .env (sin pisar lo que ya venga del entorno) ───────────────────
if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line; do
    # El .env puede venir con CRLF (Windows). Sin esto el CR queda pegado al
    # final del valor y la base pasa a llamarse "postgresCR".
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    key="${line%%=*}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    [[ -z "$key" ]] && continue
    if [[ -z "${!key:-}" ]]; then
      export "${key}=${line#*=}"
    fi
  done < "$ENV_FILE"
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  cat >&2 <<'EOF'
ERROR: SUPABASE_DB_URL no está definida.

Poné en el .env de la raíz la connection string del SESSION POOLER de Supabase
(puerto 5432). El transaction pooler (6543) NO sirve: pg_dump necesita sesión.

  Supabase → Project Settings → Database → Connection string → Session pooler

  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres
EOF
  exit 1
fi

# ── 2. Elegir pg_dump: local si es major 17, si no vía Docker ───────────────
PG_DUMP_MODE="docker"
if command -v pg_dump >/dev/null 2>&1; then
  local_major="$(pg_dump --version | sed -nE 's/^pg_dump \(PostgreSQL\) ([0-9]+).*/\1/p')"
  if [[ "$local_major" == "17" ]]; then
    PG_DUMP_MODE="local"
  else
    echo "pg_dump local es major ${local_major}, el destino es Postgres 17 → uso docker postgres:17-alpine." >&2
  fi
else
  echo "pg_dump no está instalado localmente → uso docker postgres:17-alpine." >&2
fi

if [[ "$PG_DUMP_MODE" == "docker" ]] && ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: hace falta pg_dump 17 o Docker para generar el snapshot." >&2
  exit 1
fi

run_pg_dump() {
  if [[ "$PG_DUMP_MODE" == "local" ]]; then
    pg_dump "$@"
  else
    docker run --rm -i postgres:17-alpine pg_dump "$@"
  fi
}

# ── 3. Armar los -t de cada tabla ───────────────────────────────────────────
TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=(-t "public.$t")
done

mkdir -p "$OUT_DIR"

# Escritura atómica: se dumpea a temporales y recién al final, si TODO salió
# bien (incluido el chequeo de datos personales), se hace mv al nombre real.
# Así un pg_dump cortado a la mitad no deja un 02_seed.sql parcial que Postgres
# cargaría sin avisar en el próximo `make reset`.
tmp_schema=""
tmp_seed=""
trap 'rm -f "$tmp_schema" "$tmp_seed"' EXIT

tmp_schema="$(mktemp --suffix=.tmp "$OUT_DIR/.schema.XXXXXX")"
tmp_seed="$(mktemp --suffix=.tmp "$OUT_DIR/.seed.XXXXXX")"

# ── 4. Schema ───────────────────────────────────────────────────────────────
echo "→ Dump del schema (${#TABLES[@]} tablas)..."
# El grep saca las líneas de roles/extensiones propias de Supabase, para que el
# archivo cargue en un Postgres limpio. `set -o pipefail` hace que un pg_dump
# fallido corte acá aunque grep salga 0.
run_pg_dump "$SUPABASE_DB_URL" \
  --schema-only --no-owner --no-privileges --schema=public \
  "${TABLE_ARGS[@]}" \
  | grep -vE '\b(anon|authenticated|service_role|supabase_[a-z_]+)\b' > "$tmp_schema"
echo "  ✓ schema ($(wc -l < "$tmp_schema") líneas)"

# ── 5. Datos ────────────────────────────────────────────────────────────────
echo "→ Dump de datos..."
{
  echo "-- Generado por scripts/db-snapshot.sh — NO commitear."
  echo "-- FKs desactivadas durante la carga: pg_dump --data-only no garantiza"
  echo "-- orden topológico entre tablas."
  echo "SET session_replication_role = 'replica';"
  echo
  run_pg_dump "$SUPABASE_DB_URL" \
    --data-only --no-owner --no-privileges --schema=public \
    "${TABLE_ARGS[@]}"
  echo
  echo "SET session_replication_role = 'origin';"
} > "$tmp_seed"
echo "  ✓ seed ($(wc -l < "$tmp_seed") líneas)"

# ── 6. Chequeo de seguridad: cero PII ───────────────────────────────────────
leaks=0
for table in "${FORBIDDEN[@]}"; do
  if grep -qE "\b${table}\b" "$tmp_seed"; then
    echo "ERROR: '${table}' aparece en el dump de datos." >&2
    leaks=1
  fi
done

if [[ "$leaks" -ne 0 ]]; then
  # El trap borra los temporales; los archivos publicados quedan como estaban.
  echo "Snapshot abortado por seguridad. Revisá la lista TABLES del script." >&2
  exit 1
fi

echo "  ✓ sin datos personales (newsletter_subscribers / email_logs / articles)"

# ── 7. Recién ahora se publican los archivos ────────────────────────────────
mv "$tmp_schema" "$SCHEMA_FILE"
mv "$tmp_seed"   "$SEED_FILE"
tmp_schema=""
tmp_seed=""
echo "  ✓ $SCHEMA_FILE"
echo "  ✓ $SEED_FILE"
echo
echo "Listo. Ahora: make reset   (recrea la base local y carga db/init/)"
