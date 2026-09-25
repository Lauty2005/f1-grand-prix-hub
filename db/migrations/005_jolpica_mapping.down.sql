-- 005_jolpica_mapping.down.sql — revierte 005_jolpica_mapping.sql.
-- Solo borra lo que agregó la migración; no toca datos preexistentes.
BEGIN;
DROP INDEX IF EXISTS races_season_jolpica_round_key;
DROP INDEX IF EXISTS drivers_jolpica_id_key;
ALTER TABLE races   DROP COLUMN IF EXISTS jolpica_round;
ALTER TABLE drivers DROP COLUMN IF EXISTS jolpica_id;
COMMIT;
