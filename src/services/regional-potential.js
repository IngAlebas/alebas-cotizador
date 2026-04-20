// Agregados solares regionales — inspirado en Project Sunroof (dataset
// `bigquery-public-data.sunroof_solar`, deprecado, solo US). Emula dos
// métricas útiles a nivel de departamento/ciudad SIN requerir análisis
// de imágenes por techo:
//
//   yearlyKwhPerKwp  — producción anual estimada por kWp instalado,
//                      equivale al `yearly_sunlight_kwh_kw_threshold_avg`
//                      de Sunroof. Se deriva de PSH × 365 × PR (0.78)
//                      usando los datos del OR regional.
//   percentQualified — % heurístico de techos aptos para solar. Análogo
//                      a `percent_qualified` de Sunroof, pero derivado
//                      del PSH + tipo de clima (Sunroof usa análisis de
//                      imagen real; acá damos una cota razonable con
//                      fuente explícita).
//
// Nota: valores presentados como referencia regional; la cotización real
// siempre usa PVGIS/NASA POWER por coordenadas exactas.

import { OPERATORS, DESTINOS_COURIER } from '../constants';

// Performance ratio usado en todo el cotizador (ver calcSystem).
const PR = 0.78;

// PSH por departamento, construido a partir del OR asignado regionalmente.
// Un operador puede cubrir varios depts (ej. Air-e: Atlántico, Magdalena,
// La Guajira). Tomamos su PSH para cada dept listado.
function buildDeptPshMap() {
  const map = new Map();
  for (const op of OPERATORS) {
    if (!op.psh || !op.region) continue;
    const depts = String(op.region).split(',').map(s => s.trim()).filter(Boolean);
    for (const dept of depts) {
      if (!map.has(dept)) map.set(dept, { psh: op.psh, operator: op.name });
    }
  }
  return map;
}

const DEPT_PSH = buildDeptPshMap();

// Heurística de % de techos aptos basada en PSH (sin análisis de imagen).
// Sunroof US reporta rangos típicos 70-90% para áreas con buen recurso solar;
// aplicamos la misma ventana calibrada para el trópico colombiano (donde el
// cielo nublado crónico en Andes altos reduce la aptitud vs. Caribe/Llanos).
function percentQualifiedFromPsh(psh) {
  if (psh >= 5.2) return 90;   // Caribe, Llanos secos
  if (psh >= 4.8) return 85;   // Valles interandinos, Meta
  if (psh >= 4.5) return 80;   // Andes medios, Valle
  if (psh >= 4.2) return 75;   // Altiplano, zonas intermedias
  if (psh >= 4.0) return 70;   // Andes altos, nublados
  return 65;                   // Pacífico, alta nubosidad
}

// Etiqueta climática descriptiva usada en el banner.
function climateLabel(psh) {
  if (psh >= 5.2) return 'Excelente recurso solar (Caribe / Llanos)';
  if (psh >= 4.8) return 'Muy buen recurso (valles interandinos)';
  if (psh >= 4.5) return 'Buen recurso (Andes medios, Valle)';
  if (psh >= 4.2) return 'Recurso moderado (altiplano)';
  if (psh >= 4.0) return 'Recurso limitado (Andes altos)';
  return 'Recurso bajo (Pacífico / alta nubosidad)';
}

// Devuelve el potencial regional para un departamento. Retorna null si no hay
// datos — la UI debe manejar el caso (ej. Amazonas, territorios sin OR listado).
export function regionalPotential(dept) {
  const entry = DEPT_PSH.get(dept);
  if (!entry) return null;
  const { psh, operator } = entry;
  const yearlyKwhPerKwp = Math.round(psh * 365 * PR);
  return {
    dept,
    operator,
    psh,
    yearlyKwhPerKwp,
    percentQualified: percentQualifiedFromPsh(psh),
    climate: climateLabel(psh),
    performanceRatio: PR,
    source: 'PSH regional del OR + heurística de aptitud (referencia; la cotización usa PVGIS por coordenadas)',
  };
}

// Agregado nacional — promedio ponderado por nº de ciudades cubiertas en
// DESTINOS_COURIER. Útil para comparativos ("Villavicencio está 8% por encima
// del promedio nacional").
export function nationalAverage() {
  let sumPsh = 0, sumQual = 0, n = 0;
  for (const d of DESTINOS_COURIER) {
    const p = regionalPotential(d.dept);
    if (!p) continue;
    sumPsh += p.psh;
    sumQual += p.percentQualified;
    n++;
  }
  if (!n) return null;
  const psh = sumPsh / n;
  return {
    psh: parseFloat(psh.toFixed(2)),
    yearlyKwhPerKwp: Math.round(psh * 365 * PR),
    percentQualified: Math.round(sumQual / n),
    cities: n,
  };
}

// Ranking de departamentos por producción anual. Devuelve array ordenado
// descendentemente — útil para un dashboard "top regiones" en BackOffice.
export function rankDepartments() {
  const rows = [];
  for (const dept of DEPT_PSH.keys()) {
    const p = regionalPotential(dept);
    if (p) rows.push(p);
  }
  rows.sort((a, b) => b.yearlyKwhPerKwp - a.yearlyKwhPerKwp);
  return rows;
}
