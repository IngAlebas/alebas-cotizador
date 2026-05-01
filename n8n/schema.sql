-- ALEBAS SolarHub — Postgres schema (run once in n8n Postgres node)
-- Stores leads coming from the quoter with dedupe + rate-limit metadata.

CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  email        TEXT UNIQUE NOT NULL,
  phone        TEXT,
  name         TEXT,
  company      TEXT,
  first_seen   TIMESTAMPTZ DEFAULT NOW(),
  last_seen    TIMESTAMPTZ DEFAULT NOW(),
  quote_count  INT DEFAULT 0,
  blocked      BOOLEAN DEFAULT FALSE,
  block_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

CREATE TABLE IF NOT EXISTS quotes (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               INT REFERENCES users(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  status                TEXT DEFAULT 'nuevo',
  system_type           TEXT,
  monthly_kwh           NUMERIC,
  operator              TEXT,
  dept                  TEXT,
  address               TEXT,
  lat                   NUMERIC,
  lon                   NUMERIC,
  kwp                   NUMERIC,
  num_panels            INT,
  panel_id              TEXT,
  production_kwh_month  NUMERIC,
  coverage_pct          NUMERIC,
  shade_index           NUMERIC,
  shade_source          TEXT,
  total_cop             BIGINT,
  total_usd             BIGINT,
  section_a_cop         BIGINT,
  section_b_cop         BIGINT,
  transport_cop         BIGINT,
  annual_sav_cop        BIGINT,
  roi_years             NUMERIC,
  has_excedentes        BOOLEAN,
  agpe_category         TEXT,
  regulatory_ids        TEXT[],
  payload               JSONB NOT NULL,
  ip                    INET,
  user_agent            TEXT,
  solar_panels          JSONB,
  panel_height_meters   NUMERIC,
  panel_width_meters    NUMERIC,
  area_m2               NUMERIC,
  whole_roof_area_m2    NUMERIC,
  imagery_quality       TEXT,
  google_yearly_kwh     NUMERIC,
  ai_provider           TEXT
);
-- Idempotent ALTERs para instalaciones previas (Fase 6).
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS solar_panels        JSONB;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS panel_height_meters NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS panel_width_meters  NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS area_m2             NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS whole_roof_area_m2  NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS imagery_quality     TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS google_yearly_kwh   NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ai_provider         TEXT;
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
-- GIN sobre solar_panels permite filtros tipo "cotizaciones con paneles en orientación X".
CREATE INDEX IF NOT EXISTS idx_quotes_solar_panels ON quotes USING gin(solar_panels);

-- ==================== CEC PANELS ====================
CREATE TABLE IF NOT EXISTS cec_panels (
  id              SERIAL PRIMARY KEY,
  manufacturer    TEXT NOT NULL,
  model           TEXT NOT NULL,
  pmax_w          NUMERIC,
  voc             NUMERIC,
  isc             NUMERIC,
  vmp             NUMERIC,
  imp             NUMERIC,
  efficiency      NUMERIC,
  length_m        NUMERIC,
  width_m         NUMERIC,
  bifacial        BOOLEAN DEFAULT FALSE,
  raw             JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cec_panels_mfr_model ON cec_panels(manufacturer, model);
CREATE INDEX IF NOT EXISTS idx_cec_panels_raw ON cec_panels USING gin(raw);

-- ==================== CEC INVERTERS ====================
CREATE TABLE IF NOT EXISTS cec_inverters (
  id              SERIAL PRIMARY KEY,
  manufacturer    TEXT NOT NULL,
  model           TEXT NOT NULL,
  pac_w           NUMERIC,
  vdc_min         NUMERIC,
  vdc_max         NUMERIC,
  mppt_count      INT,
  phase           TEXT,
  raw             JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cec_inverters_mfr_model ON cec_inverters(manufacturer, model);
CREATE INDEX IF NOT EXISTS idx_cec_inverters_raw ON cec_inverters USING gin(raw);

-- ==================== BATTERIES ====================
CREATE TABLE IF NOT EXISTS batteries (
  id              SERIAL PRIMARY KEY,
  manufacturer    TEXT NOT NULL,
  model           TEXT NOT NULL,
  chemistry       TEXT,
  nominal_kwh     NUMERIC,
  usable_kwh      NUMERIC,
  voltage         NUMERIC,
  cycles          INT,
  arch            TEXT,
  raw             JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batteries_mfr_model ON batteries(manufacturer, model);
CREATE INDEX IF NOT EXISTS idx_batteries_raw ON batteries USING gin(raw);

-- ==================== SOLAR CACHE (Fase 6) ====================
-- Cachea respuestas de Google Solar API por coordenada (5 dec ≈ 1 m).
-- TTL 90 días — los techos cambian poco; configs nuevas re-cachean al expirar.
-- Reduce costo Google: cada findClosest+dataLayers cuesta ~$0.04 USD.
CREATE TABLE IF NOT EXISTS solar_cache (
  id           BIGSERIAL PRIMARY KEY,
  cache_key    TEXT UNIQUE NOT NULL,
  address      TEXT,
  lat          NUMERIC,
  lon          NUMERIC,
  response     JSONB NOT NULL,
  source       TEXT,
  confidence   NUMERIC,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  hit_count    INT DEFAULT 0,
  last_hit_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_solar_cache_key      ON solar_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_solar_cache_expires  ON solar_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_solar_cache_coords   ON solar_cache(lat, lon);
CREATE INDEX IF NOT EXISTS idx_solar_cache_response ON solar_cache USING gin(response);
