-- 006_result_constructor.down.sql — revierte 006_result_constructor.sql.
-- Borra trigger, función, columnas e índices nuevos. NO revierte la fila de
-- Tsunoda en driver_seasons 2026 ni su active/constructor_id: es un dato real
-- de la grilla, no parte del schema. Si hiciera falta:
--   DELETE FROM driver_seasons WHERE driver_id = 5 AND year = 2026;
--   UPDATE drivers SET active = false, constructor_id = 11 WHERE id = 5;
BEGIN;
DROP TRIGGER IF EXISTS results_fill_constructor ON results;
DROP TRIGGER IF EXISTS sprint_results_fill_constructor ON sprint_results;
DROP FUNCTION IF EXISTS fill_result_constructor();
DROP INDEX IF EXISTS results_constructor_id_idx;
DROP INDEX IF EXISTS sprint_results_constructor_id_idx;
ALTER TABLE results        DROP COLUMN IF EXISTS constructor_id;
ALTER TABLE sprint_results DROP COLUMN IF EXISTS constructor_id;
DROP INDEX IF EXISTS constructors_jolpica_id_key;
ALTER TABLE constructors DROP COLUMN IF EXISTS jolpica_id;
COMMIT;
