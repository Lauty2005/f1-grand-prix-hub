-- 007_driver_acronym.down.sql — revierte 007_driver_acronym.sql.
BEGIN;
DROP INDEX IF EXISTS drivers_acronym_key;
ALTER TABLE drivers DROP COLUMN IF EXISTS acronym;
COMMIT;
