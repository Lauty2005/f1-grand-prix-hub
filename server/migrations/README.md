# Migraciones de base de datos

## Orden de ejecución

Ejecutar siempre en orden numérico. Cada migración asume que las anteriores ya fueron aplicadas.

| N° | Archivo | Descripción |
|----|---------|-------------|
| 001 | `001_add_cascade_fks.js` | Agrega `ON DELETE CASCADE` en foreign keys de todas las tablas de resultados |
| 002 | `002_add_unique_constraints.sql` | Agrega constraints `UNIQUE (race_id, driver_id)` para habilitar UPSERT |

## Cómo ejecutar
```bash
# Desde la carpeta server/
npm run migrate:fks         # Ejecuta migración 001 (Node.js)
npm run migrate:constraints # Ejecuta migración 002 (SQL directo via psql)
```

## Antes de ejecutar en producción

1. Hacer backup de la DB: `pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql`
2. Ejecutar primero en un entorno de staging/local
3. La migración 002 fallará si existen filas duplicadas en alguna tabla. Verificar con:
```sql
SELECT race_id, driver_id, COUNT(*) 
FROM results 
GROUP BY race_id, driver_id 
HAVING COUNT(*) > 1;
```

Si hay duplicados, limpiarlos antes de ejecutar:
```sql
DELETE FROM results 
WHERE id NOT IN (
    SELECT MIN(id) FROM results GROUP BY race_id, driver_id
);
```

Repetir para `qualifying`, `sprint_results`, `sprint_qualifying` y `practices`.

## Agregar nuevas migraciones

Seguir la convención: `NNN_descripcion_snake_case.sql` o `.js` según corresponda. Incrementar el número secuencialmente.