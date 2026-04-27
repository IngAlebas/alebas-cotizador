-- Seed: catálogo curado de baterías (mercado CO).
-- Idempotente: re-ejecutable sin duplicar filas.
--
-- Uso A (n8n UI): pegar en un nodo Postgres → Operation: Execute Query → Execute step.
-- Uso B (psql):   psql "$DATABASE_URL" -f n8n/seed/batteries.sql

CREATE TABLE IF NOT EXISTS batteries (
  id           SERIAL PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  model        TEXT NOT NULL,
  chemistry    TEXT,
  nominal_kwh  NUMERIC,
  usable_kwh   NUMERIC,
  voltage      NUMERIC,
  cycles       INTEGER,
  arch         TEXT,
  raw          JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE batteries ADD CONSTRAINT uq_batteries_mfr_model UNIQUE (manufacturer, model);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO batteries (manufacturer, model, chemistry, nominal_kwh, usable_kwh, voltage, cycles, arch, raw)
VALUES
  ('BYD',       'Battery-Box Premium HVS 5.1', 'LiFePO4', 5.12, 5.12, 204, 6000, 'HV', '{"warrantyYears":10,"dod":100}'),
  ('BYD',       'Battery-Box Premium LVS 4.0', 'LiFePO4', 4.0,  4.0,  51,  6000, 'LV', '{"warrantyYears":10,"dod":100}'),
  ('Pylontech', 'US3000C',                     'LiFePO4', 3.55, 3.55, 48,  6000, 'LV', '{"warrantyYears":10,"dod":90}'),
  ('Pylontech', 'US5000',                      'LiFePO4', 4.8,  4.8,  48,  6000, 'LV', '{"warrantyYears":10,"dod":95}'),
  ('Huawei',    'LUNA2000-5-S0',               'LiFePO4', 5.0,  5.0,  200, 6000, 'HV', '{"warrantyYears":10,"dod":100}'),
  ('Huawei',    'LUNA2000-15-S0',              'LiFePO4', 15.0, 15.0, 600, 6000, 'HV', '{"warrantyYears":10,"dod":100}'),
  ('Tesla',     'Powerwall 3',                 'LiFePO4', 13.5, 13.5, 240, 6000, 'HV', '{"warrantyYears":10,"dod":100}'),
  ('Growatt',   'ARK 2.5H-A1',                 'LiFePO4', 2.56, 2.56, 102, 6000, 'HV', '{"warrantyYears":10,"dod":90}')
ON CONFLICT (manufacturer, model) DO NOTHING;
