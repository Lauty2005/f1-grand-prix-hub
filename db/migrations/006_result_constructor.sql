-- 006_result_constructor.sql
-- Equipo por resultado: results/sprint_results.constructor_id.
--
-- Motivo: driver_seasons guarda UN equipo por piloto y año, y no puede
-- representar cambios de equipo a mitad de temporada. El campeonato de
-- constructores daba mal:
--   2025: Red Bull 454 (oficial 451) · Racing Bulls 89 (oficial 92)
--   2026: Red Bull 216 (oficial 230) · Racing Bulls 90 (oficial 77)
-- y Tsunoda (sin driver_seasons 2026) desaparecía de los resultados de R12-R14.
--
-- Qué hace (aditiva e idempotente; requiere 005):
--   1. constructors.jolpica_id (mapeo explícito, con guard de nombres).
--   2. constructor_id (nullable, FK) en results y sprint_results.
--   3. Trigger BEFORE INSERT: si nadie pasa constructor_id (carga manual del
--      admin, scripts de import), lo completa con driver_seasons del año de la
--      carrera, o drivers.constructor_id. El sync de Jolpica lo pasa explícito.
--   4. Backfill de filas existentes con la misma regla.
--   5. Correcciones de cambios de equipo, verificadas contra Jolpica (25/09/2026):
--        2025 R1-R2: Lawson → Red Bull, Tsunoda → Racing Bulls
--        2026 R12+ : Lawson → Red Bull, Tsunoda → Racing Bulls
--   6. Tsunoda en la grilla 2026 (driver_seasons: Racing Bulls, #22; activo).
--      Lawson NO se toca en driver_seasons (sigue Racing Bulls: equipo de la
--      mayor parte de 2026); su equipo real por carrera vive en results.
--
-- Simulado contra producción antes de escribirla: con estas reglas el
-- campeonato de constructores 2025 y 2026 (hasta R14) coincide exactamente con
-- el oficial.
--
-- Rollback: 006_result_constructor.down.sql

BEGIN;

-- ── 1. constructors.jolpica_id ──────────────────────────────────────────────
ALTER TABLE constructors ADD COLUMN IF NOT EXISTS jolpica_id varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS constructors_jolpica_id_key
  ON constructors (jolpica_id) WHERE jolpica_id IS NOT NULL;

CREATE TEMP TABLE _constructor_map (id int PRIMARY KEY, jid text NOT NULL, name_like text NOT NULL) ON COMMIT DROP;
INSERT INTO _constructor_map VALUES
  (1,'red_bull','Red Bull%'),  (2,'ferrari','Ferrari'),      (3,'mclaren','McLaren'),
  (4,'mercedes','Mercedes'),   (5,'williams','Williams'),    (6,'rb','Racing Bulls'),
  (7,'aston_martin','Aston Martin'), (8,'haas','Haas'),      (9,'audi','Audi'),
  (10,'alpine','Alpine'),      (11,'cadillac','Cadillac'),   (12,'sauber','%Sauber');

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(format('id=%s esperado=%s encontrado=%s', m.id, m.name_like, coalesce(c.name, '<no existe>')), '; ')
    INTO bad
  FROM _constructor_map m LEFT JOIN constructors c ON c.id = m.id
  WHERE c.id IS NULL OR c.name NOT ILIKE m.name_like;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Mapeo de constructores no coincide con esta base: %', bad;
  END IF;
END $$;

UPDATE constructors c SET jolpica_id = m.jid
FROM _constructor_map m
WHERE c.id = m.id AND c.jolpica_id IS DISTINCT FROM m.jid;

-- ── 2. Columnas ─────────────────────────────────────────────────────────────
ALTER TABLE results        ADD COLUMN IF NOT EXISTS constructor_id integer REFERENCES constructors(id);
ALTER TABLE sprint_results ADD COLUMN IF NOT EXISTS constructor_id integer REFERENCES constructors(id);
CREATE INDEX IF NOT EXISTS results_constructor_id_idx        ON results (constructor_id);
CREATE INDEX IF NOT EXISTS sprint_results_constructor_id_idx ON sprint_results (constructor_id);

COMMENT ON COLUMN results.constructor_id IS
  'Equipo con el que se corrió esta carrera. Lo pasa el sync (Jolpica); si falta, lo completa el trigger fill_result_constructor.';
COMMENT ON COLUMN sprint_results.constructor_id IS
  'Equipo con el que se corrió este sprint. Ver results.constructor_id.';

-- ── 3. Trigger para inserts que no traen equipo ─────────────────────────────
CREATE OR REPLACE FUNCTION fill_result_constructor() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.constructor_id IS NULL THEN
    SELECT COALESCE(ds.constructor_id, d.constructor_id)
      INTO NEW.constructor_id
      FROM drivers d
      JOIN races r ON r.id = NEW.race_id
      LEFT JOIN driver_seasons ds ON ds.driver_id = d.id AND ds.year = EXTRACT(YEAR FROM r.date)::int
     WHERE d.id = NEW.driver_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS results_fill_constructor ON results;
CREATE TRIGGER results_fill_constructor
  BEFORE INSERT ON results
  FOR EACH ROW EXECUTE FUNCTION fill_result_constructor();

DROP TRIGGER IF EXISTS sprint_results_fill_constructor ON sprint_results;
CREATE TRIGGER sprint_results_fill_constructor
  BEFORE INSERT ON sprint_results
  FOR EACH ROW EXECUTE FUNCTION fill_result_constructor();

-- ── 4. Backfill ─────────────────────────────────────────────────────────────
-- Misma regla que el trigger: driver_seasons del año de la carrera; si no hay,
-- drivers.constructor_id. driver_seasons es UNIQUE (driver_id, year): a lo sumo 1 fila.
UPDATE results x SET constructor_id = COALESCE(
         (SELECT ds.constructor_id FROM driver_seasons ds JOIN races r ON r.id = x.race_id
           WHERE ds.driver_id = x.driver_id AND ds.year = EXTRACT(YEAR FROM r.date)::int),
         (SELECT d.constructor_id FROM drivers d WHERE d.id = x.driver_id))
 WHERE x.constructor_id IS NULL;

UPDATE sprint_results x SET constructor_id = COALESCE(
         (SELECT ds.constructor_id FROM driver_seasons ds JOIN races r ON r.id = x.race_id
           WHERE ds.driver_id = x.driver_id AND ds.year = EXTRACT(YEAR FROM r.date)::int),
         (SELECT d.constructor_id FROM drivers d WHERE d.id = x.driver_id))
 WHERE x.constructor_id IS NULL;

-- ── 5. Correcciones de cambios de equipo (verificadas contra Jolpica) ───────
CREATE TEMP TABLE _swaps (season int, round_from int, round_to int, driver_id int, last_name text, constructor_id int) ON COMMIT DROP;
INSERT INTO _swaps VALUES
  (2025, 1,  2,   11, 'Lawson',  1),   -- Lawson en Red Bull
  (2025, 1,  2,    5, 'Tsunoda', 6),   -- Tsunoda en Racing Bulls
  (2026, 12, 999, 11, 'Lawson',  1),   -- desde Zandvoort: Lawson a Red Bull
  (2026, 12, 999,  5, 'Tsunoda', 6);   -- Tsunoda a Racing Bulls

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(format('driver_id=%s esperado=%s', s.driver_id, s.last_name), '; ') INTO bad
  FROM (SELECT DISTINCT driver_id, last_name FROM _swaps) s
  LEFT JOIN drivers d ON d.id = s.driver_id
  WHERE d.id IS NULL OR d.last_name <> s.last_name;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Pilotos de las correcciones no coinciden con esta base: %', bad;
  END IF;
END $$;

UPDATE results x SET constructor_id = s.constructor_id
  FROM _swaps s, races r
 WHERE r.id = x.race_id AND x.driver_id = s.driver_id
   AND EXTRACT(YEAR FROM r.date)::int = s.season
   AND r.jolpica_round BETWEEN s.round_from AND s.round_to
   AND x.constructor_id IS DISTINCT FROM s.constructor_id;

UPDATE sprint_results x SET constructor_id = s.constructor_id
  FROM _swaps s, races r
 WHERE r.id = x.race_id AND x.driver_id = s.driver_id
   AND EXTRACT(YEAR FROM r.date)::int = s.season
   AND r.jolpica_round BETWEEN s.round_from AND s.round_to
   AND x.constructor_id IS DISTINCT FROM s.constructor_id;

-- ── 6. Tsunoda en la grilla 2026 ────────────────────────────────────────────
INSERT INTO driver_seasons (driver_id, constructor_id, year, number)
VALUES (5, 6, 2026, 22)
ON CONFLICT (driver_id, year) DO NOTHING;

UPDATE drivers SET active = true, constructor_id = 6
 WHERE id = 5 AND last_name = 'Tsunoda'
   AND (active IS DISTINCT FROM true OR constructor_id IS DISTINCT FROM 6);

-- ── Chequeo final ───────────────────────────────────────────────────────────
DO $$
DECLARE n_null_r int; n_null_s int; n_map int;
BEGIN
  SELECT count(*) INTO n_null_r FROM results        WHERE constructor_id IS NULL;
  SELECT count(*) INTO n_null_s FROM sprint_results WHERE constructor_id IS NULL;
  SELECT count(*) INTO n_map    FROM constructors   WHERE jolpica_id IS NOT NULL;
  IF n_null_r > 0 OR n_null_s > 0 OR n_map <> 12 THEN
    RAISE EXCEPTION 'Chequeo final falló: results sin equipo=%, sprint sin equipo=%, constructores mapeados=% (esperado 12)',
      n_null_r, n_null_s, n_map;
  END IF;
  RAISE NOTICE 'OK: constructores mapeados=%, results y sprint_results con equipo en todas las filas', n_map;
END $$;

COMMIT;
