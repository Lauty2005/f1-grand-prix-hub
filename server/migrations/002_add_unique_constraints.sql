BEGIN;

ALTER TABLE results
    ADD CONSTRAINT results_race_driver_unique UNIQUE (race_id, driver_id);

ALTER TABLE qualifying
    ADD CONSTRAINT qualifying_race_driver_unique UNIQUE (race_id, driver_id);

ALTER TABLE sprint_results
    ADD CONSTRAINT sprint_results_race_driver_unique UNIQUE (race_id, driver_id);

ALTER TABLE sprint_qualifying
    ADD CONSTRAINT sprint_qualifying_race_driver_unique UNIQUE (race_id, driver_id);

ALTER TABLE practices
    ADD CONSTRAINT practices_race_driver_unique UNIQUE (race_id, driver_id);

COMMIT;