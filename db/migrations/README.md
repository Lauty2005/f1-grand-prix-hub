# `db/migrations/`

Migraciones de schema que **se commitean**, para que CI pueda aplicarlas.

No confundir con `server/migrations/`, que está en `.gitignore` y vive solo en
la máquina de desarrollo. Las migraciones **001 a 004 viven ahí afuera del repo
y ya están aplicadas** en producción; no se movieron ni se van a commitear. La
numeración de esta carpeta arranca en 005 para no pisarlas.

## Convención

```
NNN_nombre.sql        → aplica el cambio
NNN_nombre.down.sql   → lo revierte
```

`NNN` es un entero de tres dígitos, y el orden de aplicación es el orden
alfabético de los nombres.

## Todas tienen que ser idempotentes

`make migrate` corre **todos** los `.sql` de esta carpeta, en orden, cada vez.
No hay tabla de control de versiones. Por eso cada migración tiene que poder
correr N veces sin cambiar nada después de la primera:

- `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP ... IF EXISTS`.
- Los `UPDATE` usan `WHERE col IS DISTINCT FROM <valor>`, así una segunda
  corrida afecta 0 filas.
- Todo envuelto en `BEGIN; ... COMMIT;`.

Conviene además que validen sus supuestos y aborten con `RAISE EXCEPTION` si la
base no es la esperada, en vez de escribir datos mal en silencio.

## Comandos

```bash
make migrate                              # aplica todo, en orden
make migrate-down M=005_jolpica_mapping   # revierte una
```

Contra producción no se usa `psql`: se pega el contenido en el SQL Editor de
Supabase. Ver la sección de producción en el plan del paso 2.

## Índice

| Migración | Qué hace |
| --- | --- |
| `005_jolpica_mapping` | Agrega `drivers.jolpica_id` y `races.jolpica_round` con su mapeo verificado contra la API de Jolpica. |
