# `db/init/` — snapshot de los datos deportivos

Postgres ejecuta todo lo que haya acá, en orden alfabético, **la primera vez
que se crea el volumen** (`docker-entrypoint-initdb.d`). Si el volumen ya
existe, estos archivos se ignoran: hay que hacer `make reset`.

| Archivo | Contenido | Git |
| --- | --- | --- |
| `01_schema.sql` | DDL de las 10 tablas deportivas | **se commitea** (no tiene datos, CI lo va a usar) |
| `02_seed.sql` | `COPY` con las filas | **gitignored** |

## Tablas incluidas

`constructors`, `drivers`, `driver_seasons`, `races`, `results`, `qualifying`,
`sprint_results`, `sprint_qualifying`, `race_strategies`, `practices`.

## Tablas excluidas a propósito

`newsletter_subscribers` y `email_logs` tienen datos personales y **nunca** se
exportan. `articles` tampoco: no hace falta para el trabajo de datos
deportivos. `scripts/db-snapshot.sh` aborta y borra el seed si alguna de las
tres aparece en el dump.

## Regenerar el snapshot

1. Conseguir la connection string del **session pooler** de Supabase
   (Project Settings → Database → Connection string → Session pooler, puerto
   **5432**). El transaction pooler (6543) no sirve: `pg_dump` necesita una
   sesión real.

2. Ponerla en el `.env` de la raíz:

   ```
   SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres
   ```

3. Correr:

   ```bash
   make snapshot   # o: bash scripts/db-snapshot.sh
   make reset      # recrea el volumen y vuelve a cargar db/init/
   ```

El script usa `pg_dump` local solo si es major 17; si no, lo corre con
`docker run --rm postgres:17-alpine pg_dump`, para que el dump coincida con la
versión del contenedor destino.

## Por qué el seed arranca con `session_replication_role = 'replica'`

`pg_dump --data-only` no garantiza orden topológico entre tablas, así que
cargar `qualifying` antes que `races` violaría las FKs. El script envuelve el
dump desactivando los triggers de FK durante la carga y los restaura al final.

## Estado actual (2026-09-25)

Snapshot generado con `pg_dump` real (postgres:17-alpine vía Docker) contra el
session pooler de Supabase. Los dos archivos están al día:

| Archivo | Líneas | Contenido |
| --- | --- | --- |
| `01_schema.sql` | 783 | DDL de las 10 tablas |
| `02_seed.sql` | 4054 | datos, con 10 `setval` de secuencias |

Conteos cargados en local, idénticos a producción: `results=634`,
`qualifying=631`, `sprint_results=175`, `races=48`, `drivers=30`,
`constructors=12`, `race_strategies=1466`, `practices=640`.

En el paso 1 este dump no se pudo hacer: la red no llegaba a los puertos
Postgres de Supabase y `01_schema.sql` quedó reconstruido desde `pg_catalog`.
Ese archivo ya fue reemplazado por el `pg_dump` real.

## `timeline_moments` no está incluida

La base tiene una tabla `timeline_moments` que alimenta `/api/timeline` y que no
está en la lista de 10 tablas de este paso. No tiene datos personales. Si hace
falta que `/api/timeline` funcione en local, agregala al array `TABLES` de
`scripts/db-snapshot.sh` y a `01_schema.sql`.
