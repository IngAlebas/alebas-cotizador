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
  user_agent            TEXT
);
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

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

-- ==================== WHATSAPP ====================

CREATE TABLE IF NOT EXISTS otp_codes (
  id          BIGSERIAL PRIMARY KEY,
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  ip          INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone_expires ON otp_codes(phone, expires_at DESC);

CREATE TABLE IF NOT EXISTS wa_messages (
  id            BIGSERIAL PRIMARY KEY,
  phone         TEXT NOT NULL,
  quote_id      BIGINT REFERENCES quotes(id) ON DELETE SET NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  template      TEXT,
  content       TEXT,
  wa_message_id TEXT,
  status        TEXT DEFAULT 'sent',
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  read_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wa_messages_phone ON wa_messages(phone);
CREATE INDEX IF NOT EXISTS idx_wa_messages_quote ON wa_messages(quote_id);

CREATE TABLE IF NOT EXISTS wa_conversations (
  id              BIGSERIAL PRIMARY KEY,
  phone           TEXT UNIQUE NOT NULL,
  state           TEXT DEFAULT 'initial',
  context_json    JSONB DEFAULT '{}',
  quote_id        BIGINT REFERENCES quotes(id) ON DELETE SET NULL,
  opt_out         BOOLEAN DEFAULT FALSE,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_phone ON wa_conversations(phone);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS dedupe_key        UUID UNIQUE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS phone_verified    BOOLEAN DEFAULT FALSE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS verified_token    TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS data_consent      JSONB;
ALTER TABLE users  ADD COLUMN IF NOT EXISTS wa_opt_out        BOOLEAN DEFAULT FALSE;

-- ==================== TECHNICIANS ====================
CREATE TABLE IF NOT EXISTS technicians (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  phone       TEXT,
  retie_cert  TEXT,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS technician_id    INT REFERENCES technicians(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tech_token       UUID DEFAULT gen_random_uuid();
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tech_approved_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tech_notes       TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS doc_status       TEXT DEFAULT 'pendiente';
-- doc_status values: 'pendiente' | 'en_revision' | 'aprobado' | 'cambios_solicitados'
