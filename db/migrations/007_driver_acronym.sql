-- 007_driver_acronym.sql
-- drivers.acronym: sigla de 3 letras (VER, NOR, ...) para vincular pilotos con
-- OpenF1, que identifica por driver_number (cambia entre temporadas: Norris 1 y
-- Verstappen 3 en 2026) y por name_acronym. Se usa para el sync de prácticas.
--
-- Aditiva e idempotente. Guard de apellidos: si un id no corresponde al piloto
-- esperado, aborta con ROLLBACK.
--
-- Las siglas de pilotos titulares vienen del campo `code` de Jolpica. Las de
-- reservas (Fornaroli, Aron, Beganovic, Iwasa, Herta, Vesti) se VERIFICAN en el
-- paso de paridad contra OpenF1 (/drivers?session_key=<FP1 de Barcelona>) antes
-- de aplicar en producción; una sigla que no coincida solo hace que ese reserva
-- se saltee con advertencia, nunca rompe el sync.
--
-- Rollback: 007_driver_acronym.down.sql

BEGIN;

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS acronym varchar(3);
CREATE UNIQUE INDEX IF NOT EXISTS drivers_acronym_key
  ON drivers (acronym) WHERE acronym IS NOT NULL;
COMMENT ON COLUMN drivers.acronym IS
  'Sigla de 3 letras (OpenF1 name_acronym / Jolpica code). Vincula pilotos en el sync de prácticas.';

CREATE TEMP TABLE _acronym_map (id int PRIMARY KEY, acr text NOT NULL, last_name text NOT NULL) ON COMMIT DROP;
INSERT INTO _acronym_map VALUES
  (1,'VER','Verstappen'),  (2,'LEC','Leclerc'),   (3,'NOR','Norris'),     (4,'HAM','Hamilton'),
  (5,'TSU','Tsunoda'),     (6,'PIA','Piastri'),   (7,'RUS','Russell'),    (8,'ANT','Antonelli'),
  (9,'ALB','Albon'),       (10,'SAI','Sainz'),    (11,'LAW','Lawson'),    (12,'HAD','Hadjar'),
  (13,'ALO','Alonso'),     (14,'STR','Stroll'),   (15,'OCO','Ocon'),      (16,'BEA','Bearman'),
  (17,'HUL','Hulkenberg'), (18,'BOR','Bortoleto'),(19,'GAS','Gastly'),    (20,'COL','Colapinto'),
  (21,'DOO','Doohan'),     (22,'LIN','Lindblad'), (23,'PER','Pérez'),     (24,'BOT','Bottas'),
  (25,'FOR','Fornaroli'),  (26,'ARO','Aron'),     (27,'BEG','Beganovic'), (28,'IWA','Iwasa'),
  (30,'HER','Herta'),      (31,'VES','Vesti');

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(format('id=%s esperado=%s encontrado=%s', m.id, m.last_name, coalesce(d.last_name, '<no existe>')), '; ')
    INTO bad
  FROM _acronym_map m LEFT JOIN drivers d ON d.id = m.id
  WHERE d.id IS NULL OR d.last_name <> m.last_name;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Mapeo de siglas no coincide con esta base: %', bad;
  END IF;
END $$;

UPDATE drivers d SET acronym = m.acr
FROM _acronym_map m
WHERE d.id = m.id AND d.acronym IS DISTINCT FROM m.acr;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM drivers WHERE acronym IS NOT NULL;
  IF n <> 30 THEN
    RAISE EXCEPTION 'Chequeo final falló: pilotos con sigla=% (esperado 30)', n;
  END IF;
  RAISE NOTICE 'OK: pilotos con sigla=%', n;
END $$;

COMMIT;
