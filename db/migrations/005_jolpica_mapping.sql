-- 005_jolpica_mapping.sql
-- Mapeo explícito de pilotos y carreras a la API de Jolpica (sucesora de Ergast).
--
-- Aditiva e idempotente: agrega dos columnas nullable, dos índices únicos
-- parciales y las rellena. No toca ninguna columna existente.
--
-- Por qué mapeo explícito y no por número/nombre:
--   * Ronda: en 2026 Jolpica renumeró tras cancelar Bahrain y Arabia Saudita
--     (ids 40/41 acá, 'suspended'). Monaco es round 8 acá y 6 en Jolpica.
--   * Piloto: los números cambiaron (Norris 1, Verstappen 3, Lindblad 41 en
--     Jolpica 2026) y los nombres no coinciden (Gastly/Gasly, Hulkenberg/Hülkenberg).
--
-- Cada fila del mapeo lleva un patrón de nombre: si un id no corresponde al
-- piloto/carrera esperado (p. ej. una base con ids distintos), la migración
-- aborta y hace ROLLBACK en vez de mapear mal en silencio.
--
-- Rollback: 005_jolpica_mapping.down.sql

BEGIN;

-- ── Columnas ────────────────────────────────────────────────────────────────
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS jolpica_id varchar(64);
ALTER TABLE races   ADD COLUMN IF NOT EXISTS jolpica_round integer;

COMMENT ON COLUMN drivers.jolpica_id IS
  'driverId de Jolpica/Ergast (p. ej. max_verstappen). NULL = sin mapear.';
COMMENT ON COLUMN races.jolpica_round IS
  'Número de ronda en Jolpica para la temporada EXTRACT(YEAR FROM date). NULL = sin equivalente (p. ej. carrera suspendida).';

CREATE UNIQUE INDEX IF NOT EXISTS drivers_jolpica_id_key
  ON drivers (jolpica_id) WHERE jolpica_id IS NOT NULL;

-- Una ronda Jolpica por temporada.
CREATE UNIQUE INDEX IF NOT EXISTS races_season_jolpica_round_key
  ON races ((EXTRACT(YEAR FROM date)::int), jolpica_round)
  WHERE jolpica_round IS NOT NULL;

-- ── Pilotos ─────────────────────────────────────────────────────────────────
-- Verificado contra /2025/drivers.json y /2026/drivers.json el 2026-09-24.
CREATE TEMP TABLE _driver_map (id int PRIMARY KEY, jid text NOT NULL, last_name text NOT NULL) ON COMMIT DROP;
INSERT INTO _driver_map VALUES
  (1,'max_verstappen','Verstappen'), (2,'leclerc','Leclerc'),     (3,'norris','Norris'),
  (4,'hamilton','Hamilton'),         (5,'tsunoda','Tsunoda'),     (6,'piastri','Piastri'),
  (7,'russell','Russell'),           (8,'antonelli','Antonelli'), (9,'albon','Albon'),
  (10,'sainz','Sainz'),              (11,'lawson','Lawson'),      (12,'hadjar','Hadjar'),
  (13,'alonso','Alonso'),            (14,'stroll','Stroll'),      (15,'ocon','Ocon'),
  (16,'bearman','Bearman'),          (17,'hulkenberg','Hulkenberg'), (18,'bortoleto','Bortoleto'),
  (19,'gasly','Gastly'),             (20,'colapinto','Colapinto'),(21,'doohan','Doohan'),
  (22,'arvid_lindblad','Lindblad'),  (23,'perez','Pérez'),        (24,'bottas','Bottas'),
  (25,'leonardo_fornaroli','Fornaroli'), (26,'paul_aron','Aron'), (27,'dino_beganovic','Beganovic'),
  (28,'ayumu_iwasa','Iwasa'),        (30,'colton_herta','Herta'), (31,'frederik_vesti','Vesti');

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(format('id=%s esperado=%s encontrado=%s', m.id, m.last_name, coalesce(d.last_name, '<no existe>')), '; ')
    INTO bad
  FROM _driver_map m LEFT JOIN drivers d ON d.id = m.id
  WHERE d.id IS NULL OR d.last_name <> m.last_name;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Mapeo de pilotos no coincide con esta base: %', bad;
  END IF;
END $$;

UPDATE drivers d SET jolpica_id = m.jid
FROM _driver_map m
WHERE d.id = m.id AND d.jolpica_id IS DISTINCT FROM m.jid;

-- ── Carreras 2026 ───────────────────────────────────────────────────────────
-- Por fecha contra /2026.json. 40 (Bahrain) y 41 (Arabia Saudita) quedan NULL.
-- Jolpica 16 ("Bahrain Grand Prix in Malaysia", 2026-10-04) no existe en esta
-- base: queda sin vincular a propósito (crearla está fuera de alcance).
CREATE TEMP TABLE _race_map (id int PRIMARY KEY, jr int NOT NULL, name_like text NOT NULL) ON COMMIT DROP;
INSERT INTO _race_map VALUES
  (37,1,'%AUSTRALIA%'), (38,2,'%CHIN%'),     (39,3,'%JAPAN%'),      (42,4,'%MIAMI%'),
  (43,5,'%CANAD%'),     (44,6,'%MONACO%'),   (45,7,'%BARCELONA%'),  (46,8,'%AUSTRIA%'),
  (47,9,'%BRITISH%'),   (48,10,'%BELGI%'),   (49,11,'%HUNGAR%'),    (50,12,'%DUTCH%'),
  (51,13,'%ITALIA%'),   (52,14,'%ESPAÑA%'),  (53,15,'%AZERBAIJAN%'),(54,17,'%SINGAPORE%'),
  (55,18,'%UNITED STATES%'), (56,19,'%MEXICO%'), (57,20,'%PAULO%'), (58,21,'%VEGAS%'),
  (59,22,'%QATAR%'),    (60,23,'%ABU DHABI%');

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(format('id=%s esperado=%s encontrado=%s', m.id, m.name_like, coalesce(r.name, '<no existe>')), '; ')
    INTO bad
  FROM _race_map m LEFT JOIN races r ON r.id = m.id
  WHERE r.id IS NULL OR r.name NOT ILIKE m.name_like OR EXTRACT(YEAR FROM r.date) <> 2026;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Mapeo de carreras 2026 no coincide con esta base: %', bad;
  END IF;
END $$;

UPDATE races r SET jolpica_round = m.jr
FROM _race_map m
WHERE r.id = m.id AND r.jolpica_round IS DISTINCT FROM m.jr;

-- ── Carreras 2025 ───────────────────────────────────────────────────────────
-- 24 carreras, sin cancelaciones: round == ronda Jolpica (verificado contra
-- /2025.json el 2026-09-24).
UPDATE races SET jolpica_round = round
WHERE EXTRACT(YEAR FROM date) = 2025 AND jolpica_round IS DISTINCT FROM round;

-- ── Chequeo final ───────────────────────────────────────────────────────────
DO $$
DECLARE n_drv int; n_2025 int; n_2026 int; unmapped_2026 text;
BEGIN
  SELECT count(*) INTO n_drv  FROM drivers WHERE jolpica_id IS NOT NULL;
  SELECT count(*) INTO n_2025 FROM races WHERE EXTRACT(YEAR FROM date) = 2025 AND jolpica_round IS NOT NULL;
  SELECT count(*) INTO n_2026 FROM races WHERE EXTRACT(YEAR FROM date) = 2026 AND jolpica_round IS NOT NULL;
  SELECT string_agg(id::text, ',' ORDER BY id) INTO unmapped_2026
    FROM races WHERE EXTRACT(YEAR FROM date) = 2026 AND jolpica_round IS NULL;

  IF n_drv <> 30 OR n_2025 <> 24 OR n_2026 <> 22 OR unmapped_2026 IS DISTINCT FROM '40,41' THEN
    RAISE EXCEPTION 'Chequeo final falló: drivers=% (esperado 30), 2025=% (24), 2026=% (22), 2026 sin mapear=% (40,41)',
      n_drv, n_2025, n_2026, unmapped_2026;
  END IF;
  RAISE NOTICE 'OK: drivers=%, races 2025=%, races 2026=%, sin mapear 2026=%', n_drv, n_2025, n_2026, unmapped_2026;
END $$;

COMMIT;
