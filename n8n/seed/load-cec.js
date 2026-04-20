#!/usr/bin/env node
// Descarga los CSV oficiales de NREL SAM y los inserta en Postgres.
// Uso: DATABASE_URL=postgres://... node n8n/seed/load-cec.js [--panels] [--inverters] [--batteries]
// Sin flags carga los tres catálogos.

import pg from 'pg';
import https from 'https';

const { Pool } = pg;

const CEC_MODULES_URL =
  'https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Modules.csv';
const CEC_INVERTERS_URL =
  'https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Inverters.csv';

const args = process.argv.slice(2);
const doAll = args.length === 0;
const doPanels    = doAll || args.includes('--panels');
const doInverters = doAll || args.includes('--inverters');
const doBatteries = doAll || args.includes('--batteries');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ Falta DATABASE_URL. Ejemplo: DATABASE_URL=postgres://... node n8n/seed/load-cec.js');
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

function fetch(url) {
  return new Promise((resolve, reject) => {
    let data = '';
    https.get(url, { headers: { 'User-Agent': 'alebas-cotizador-seed/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} en ${url}`));
      res.on('data', d => { data += d; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function splitCSVLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]);
  // SAM CSVs: row 1 = units, row 2 = types — skip non-data rows
  const dataStart = isNaN(parseFloat(splitCSVLine(lines[1])[1])) ? 3 : 1;
  const rows = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    if (cells.length !== headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx]; });
    rows.push(row);
  }
  return rows;
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function loadPanels() {
  console.log('📥 Descargando CEC Modules CSV...');
  const text = await fetch(CEC_MODULES_URL);
  const rows = parseCSV(text);
  console.log(`   ${rows.length} filas parseadas`);

  const client = await pool.connect();
  let inserted = 0, skipped = 0;
  try {
    for (const row of rows) {
      const name = row.Name || row['Name '] || '';
      if (!name) { skipped++; continue; }
      const mfr = row.Manufacturer || name.split(' ')[0] || '';
      const model = name.replace(mfr, '').trim() || name;
      try {
        await client.query(
          `INSERT INTO cec_panels
             (manufacturer, model, pmax_w, voc, isc, vmp, imp, efficiency,
              length_m, width_m, bifacial, raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
           ON CONFLICT (manufacturer, model) DO NOTHING`,
          [
            mfr, model,
            num(row.STC) ?? num(row.P_mp_ref),
            num(row.V_oc_ref), num(row.I_sc_ref),
            num(row.V_mp_ref), num(row.I_mp_ref),
            num(row.Efficiency) ?? null,
            num(row.Length), num(row.Width),
            (row.Bifacial || '').toString().trim() === '1',
            JSON.stringify(row),
          ]
        );
        inserted++;
      } catch (e) { skipped++; }
    }
  } finally {
    client.release();
  }
  console.log(`✅ cec_panels: ${inserted} insertados, ${skipped} omitidos`);
}

async function loadInverters() {
  console.log('📥 Descargando CEC Inverters CSV...');
  const text = await fetch(CEC_INVERTERS_URL);
  const rows = parseCSV(text);
  console.log(`   ${rows.length} filas parseadas`);

  const client = await pool.connect();
  let inserted = 0, skipped = 0;
  try {
    for (const row of rows) {
      const name = row.Name || row['Name '] || '';
      if (!name) { skipped++; continue; }
      const parts = name.split(':');
      const mfr = parts[0]?.trim() || '';
      const model = parts.slice(1).join(':').trim() || name;
      const vac = num(row.Vac) || 208;
      const phase = vac >= 380 ? '3' : '1';
      try {
        await client.query(
          `INSERT INTO cec_inverters
             (manufacturer, model, pac_w, vdc_min, vdc_max, mppt_count, phase, raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
           ON CONFLICT (manufacturer, model) DO NOTHING`,
          [
            mfr, model,
            num(row.Paco),
            num(row.Mppt_low), num(row.Vdcmax),
            null, // mppt_count not in CEC CSV
            phase,
            JSON.stringify(row),
          ]
        );
        inserted++;
      } catch (e) { skipped++; }
    }
  } finally {
    client.release();
  }
  console.log(`✅ cec_inverters: ${inserted} insertados, ${skipped} omitidos`);
}

// Batteries: no hay fuente CSV oficial. Cargamos el catálogo curado de api/batteries.js.
const BATTERIES_CATALOG = [
  { manufacturer: 'Pylontech', model: 'Force H2 (módulo 3.55 kWh)', chemistry: 'LFP', nominal_kwh: 3.55, usable_kwh: 3.37, voltage: 102.4, cycles: 6000, arch: 'HV-stack', raw: { id: 'pylontech-force-h2', dod: 0.95, warrantyYears: 10, kgPerModule: 38 } },
  { manufacturer: 'BYD', model: 'Battery-Box Premium HVS 7.7', chemistry: 'LFP', nominal_kwh: 7.68, usable_kwh: 7.37, voltage: 204, cycles: 6000, arch: 'HV-stack', raw: { id: 'byd-hvs-7.7', dod: 0.96, warrantyYears: 10, kgPerModule: 91 } },
  { manufacturer: 'BYD', model: 'Battery-Box Premium HVM 11.0', chemistry: 'LFP', nominal_kwh: 11.04, usable_kwh: 10.60, voltage: 307, cycles: 6000, arch: 'HV-stack', raw: { id: 'byd-hvm-11', dod: 0.96, warrantyYears: 10, kgPerModule: 128 } },
  { manufacturer: 'Huawei', model: 'LUNA2000-5-S0', chemistry: 'LFP', nominal_kwh: 5, usable_kwh: 5, voltage: 360, cycles: 6000, arch: 'HV-stack', raw: { id: 'huawei-luna-5', dod: 1.0, warrantyYears: 10, kgPerModule: 50 } },
  { manufacturer: 'Huawei', model: 'LUNA2000-15-S0', chemistry: 'LFP', nominal_kwh: 15, usable_kwh: 15, voltage: 360, cycles: 6000, arch: 'HV-stack', raw: { id: 'huawei-luna-15', dod: 1.0, warrantyYears: 10, kgPerModule: 148 } },
  { manufacturer: 'GoodWe', model: 'Lynx Home F G2 (10 kWh)', chemistry: 'LFP', nominal_kwh: 10.24, usable_kwh: 9.73, voltage: 204, cycles: 6000, arch: 'HV-stack', raw: { id: 'goodwe-lynx-h', dod: 0.95, warrantyYears: 10, kgPerModule: 112 } },
  { manufacturer: 'Pylontech', model: 'US3000C', chemistry: 'LFP', nominal_kwh: 3.55, usable_kwh: 3.37, voltage: 48, cycles: 6000, arch: 'LV-48V', raw: { id: 'pylontech-us3000c', dod: 0.95, warrantyYears: 10, kgPerModule: 32 } },
  { manufacturer: 'Pylontech', model: 'US5000', chemistry: 'LFP', nominal_kwh: 4.8, usable_kwh: 4.56, voltage: 48, cycles: 6000, arch: 'LV-48V', raw: { id: 'pylontech-us5000', dod: 0.95, warrantyYears: 10, kgPerModule: 40 } },
  { manufacturer: 'Hubble', model: 'AM-2', chemistry: 'LFP', nominal_kwh: 5.5, usable_kwh: 5.22, voltage: 51.2, cycles: 6000, arch: 'LV-48V', raw: { id: 'hubble-am2', dod: 0.95, warrantyYears: 10, kgPerModule: 52 } },
  { manufacturer: 'Dyness', model: 'B4850', chemistry: 'LFP', nominal_kwh: 2.4, usable_kwh: 2.16, voltage: 48, cycles: 6000, arch: 'LV-48V', raw: { id: 'dyness-b4850', dod: 0.9, warrantyYears: 10, kgPerModule: 27 } },
  { manufacturer: 'Deye', model: 'SE-G5.1 Pro-B', chemistry: 'LFP', nominal_kwh: 5.12, usable_kwh: 4.61, voltage: 51.2, cycles: 6000, arch: 'LV-48V', raw: { id: 'deye-seg51', dod: 0.9, warrantyYears: 10, kgPerModule: 51 } },
  { manufacturer: 'Victron', model: 'LiFePO4 25.6V/200Ah Smart', chemistry: 'LFP', nominal_kwh: 5.12, usable_kwh: 4.10, voltage: 25.6, cycles: 5000, arch: 'LV-24V', raw: { id: 'victron-lifepo4-200', dod: 0.8, warrantyYears: 5, kgPerModule: 49 } },
];

async function loadBatteries() {
  console.log('📥 Cargando catálogo de baterías curado...');
  const client = await pool.connect();
  let inserted = 0, skipped = 0;
  try {
    for (const b of BATTERIES_CATALOG) {
      try {
        await client.query(
          `INSERT INTO batteries
             (manufacturer, model, chemistry, nominal_kwh, usable_kwh, voltage, cycles, arch, raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
           ON CONFLICT (manufacturer, model) DO NOTHING`,
          [b.manufacturer, b.model, b.chemistry, b.nominal_kwh, b.usable_kwh,
           b.voltage, b.cycles, b.arch, JSON.stringify(b.raw)]
        );
        inserted++;
      } catch (e) { skipped++; }
    }
  } finally {
    client.release();
  }
  console.log(`✅ batteries: ${inserted} insertados, ${skipped} omitidos`);
}

// Necesitamos UNIQUE constraints para ON CONFLICT — agregar si no existen
async function ensureUniqueConstraints() {
  const client = await pool.connect();
  try {
    await client.query(`
      DO $$ BEGIN
        BEGIN
          ALTER TABLE cec_panels ADD CONSTRAINT uq_cec_panels_mfr_model UNIQUE (manufacturer, model);
        EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
        END;
        BEGIN
          ALTER TABLE cec_inverters ADD CONSTRAINT uq_cec_inverters_mfr_model UNIQUE (manufacturer, model);
        EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
        END;
        BEGIN
          ALTER TABLE batteries ADD CONSTRAINT uq_batteries_mfr_model UNIQUE (manufacturer, model);
        EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
        END;
      END $$;
    `);
  } finally {
    client.release();
  }
}

(async () => {
  try {
    console.log('🔧 Verificando constraints UNIQUE...');
    await ensureUniqueConstraints();
    if (doPanels)    await loadPanels();
    if (doInverters) await loadInverters();
    if (doBatteries) await loadBatteries();
    console.log('\n🎉 Carga completa.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
