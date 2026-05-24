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

-- ============================================================
-- FASE MARKETPLACE: proveedores, stock, órdenes de compra
-- ============================================================

-- Ensure suppliers table is complete with B2B marketplace fields
CREATE TABLE IF NOT EXISTS suppliers (
  id               SERIAL PRIMARY KEY,
  company          TEXT NOT NULL,
  contact          TEXT,
  email            TEXT UNIQUE NOT NULL,
  phone            TEXT,
  nit              TEXT,
  city             TEXT,
  dept             TEXT,
  category         TEXT,
  notes            TEXT,
  bank_account     JSONB,
  platform_fee_pct NUMERIC(5,2) DEFAULT 10.0,
  supplier_token   UUID DEFAULT gen_random_uuid(),
  password_hash    TEXT,
  active           BOOLEAN DEFAULT TRUE,
  verified         BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  status           TEXT DEFAULT 'pendiente'
);
-- Extend if table already existed (idempotent)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS nit              TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city             TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS dept             TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account     JSONB;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS platform_fee_pct NUMERIC(5,2) DEFAULT 10.0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_token   UUID DEFAULT gen_random_uuid();
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS password_hash    TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS active           BOOLEAN DEFAULT TRUE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS verified         BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_suppliers_token ON suppliers(supplier_token);
CREATE INDEX IF NOT EXISTS idx_suppliers_email ON suppliers(email);

-- supplier_stock: inventario del proveedor en la plataforma
CREATE TABLE IF NOT EXISTS supplier_stock (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  equipment_type  VARCHAR(20) NOT NULL CHECK(equipment_type IN ('panel','inverter','battery','structure','protection','cable','other')),
  brand           VARCHAR(100) NOT NULL,
  model           VARCHAR(200) NOT NULL,
  wp              INTEGER,         -- paneles FV (Wp)
  kw              NUMERIC(8,2),    -- inversores (kW)
  kwh             NUMERIC(8,2),    -- baterías (kWh)
  unit_price_cop  BIGINT NOT NULL,
  qty_available   INTEGER NOT NULL DEFAULT 0 CHECK(qty_available >= 0),
  qty_reserved    INTEGER NOT NULL DEFAULT 0 CHECK(qty_reserved >= 0),
  lead_time_days  INTEGER DEFAULT 3,
  specs           JSONB,
  is_active       BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_supplier   ON supplier_stock(supplier_id, is_active);
CREATE INDEX IF NOT EXISTS idx_stock_type       ON supplier_stock(equipment_type);
CREATE INDEX IF NOT EXISTS idx_stock_critical   ON supplier_stock(supplier_id, qty_available) WHERE qty_available < 5 AND is_active = true;

-- PO sequence for human-readable order numbers
CREATE SEQUENCE IF NOT EXISTS po_seq START 1;

-- purchase_orders: órdenes de compra SolarHub → proveedor (modelo on-demand)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number         VARCHAR(20) UNIQUE NOT NULL DEFAULT 'PO-' || to_char(NOW(),'YYYY') || '-' || lpad(nextval('po_seq')::TEXT,4,'0'),
  quote_id          BIGINT REFERENCES quotes(id),
  supplier_id       INTEGER REFERENCES suppliers(id),
  technician_id     INTEGER REFERENCES technicians(id),
  status            VARCHAR(30) DEFAULT 'pendiente' CHECK(status IN ('pendiente','confirmado','preparando','enviado','entregado','instalado','completado','cancelado')),
  -- Financials (equipment side)
  subtotal_equipment  BIGINT DEFAULT 0,
  platform_fee_pct    NUMERIC(5,2) DEFAULT 10.0,
  platform_fee_cop    BIGINT DEFAULT 0,
  supplier_net_cop    BIGINT DEFAULT 0,
  -- Financials (installation side)
  installation_total  BIGINT DEFAULT 0,
  tech_fee_pct        NUMERIC(5,2) DEFAULT 80.0,
  tech_earnings_cop   BIGINT DEFAULT 0,
  sh_install_fee_cop  BIGINT DEFAULT 0,
  -- Delivery
  tracking_code     TEXT,
  estimated_delivery DATE,
  -- Timestamps per milestone
  confirmed_at      TIMESTAMPTZ,
  shipped_at        TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  installed_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  -- Ratings (1-5)
  supplier_rating   INTEGER CHECK(supplier_rating BETWEEN 1 AND 5),
  tech_rating       INTEGER CHECK(tech_rating BETWEEN 1 AND 5),
  -- Meta
  notes             TEXT,
  created_by        TEXT DEFAULT 'admin',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_supplier   ON purchase_orders(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_po_quote      ON purchase_orders(quote_id);
CREATE INDEX IF NOT EXISTS idx_po_tech       ON purchase_orders(technician_id);
CREATE INDEX IF NOT EXISTS idx_po_status_ts  ON purchase_orders(status, created_at DESC);

-- po_items: productos en cada orden de compra
CREATE TABLE IF NOT EXISTS po_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  stock_id        UUID REFERENCES supplier_stock(id),
  equipment_type  VARCHAR(20),
  brand           VARCHAR(100),
  model           VARCHAR(200),
  qty             INTEGER NOT NULL DEFAULT 1 CHECK(qty > 0),
  unit_price_cop  BIGINT,
  line_total_cop  BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON po_items(po_id);

-- commissions: registro de comisiones de la plataforma
CREATE TABLE IF NOT EXISTS commissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id            UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  commission_type  VARCHAR(30) NOT NULL, -- 'platform_equipment' | 'platform_install' | 'tech_labor'
  beneficiary      VARCHAR(20) NOT NULL, -- 'solarhub' | 'technician' | 'supplier'
  tech_id          INTEGER REFERENCES technicians(id),
  supplier_id      INTEGER REFERENCES suppliers(id),
  amount_cop       BIGINT NOT NULL,
  pct              NUMERIC(5,2),
  status           VARCHAR(20) DEFAULT 'pendiente' CHECK(status IN ('pendiente','en_proceso','pagada')),
  paid_at          TIMESTAMPTZ,
  payment_ref      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commissions_po       ON commissions(po_id);
CREATE INDEX IF NOT EXISTS idx_commissions_tech     ON commissions(tech_id);
CREATE INDEX IF NOT EXISTS idx_commissions_supplier ON commissions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status   ON commissions(status, beneficiary);

-- Add supplier/PO columns to quotes (idempotent)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS po_id       UUID REFERENCES purchase_orders(id);

-- Trigger to auto-update updated_at on supplier_stock
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS supplier_stock_updated_at ON supplier_stock;
CREATE TRIGGER supplier_stock_updated_at BEFORE UPDATE ON supplier_stock FOR EACH ROW EXECUTE FUNCTION update_updated_at();
