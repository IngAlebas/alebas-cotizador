import React, { useState } from 'react';
import { C } from '../constants';

// Perfil mensual Colombia (promedio ponderado por zona solar):
// Basado en NASA POWER GHI media para la franja 1°N-8°N, 72°O-76°O.
// Valores normalizados: suma = 1.0
const MONTHLY_PROFILE = [
  0.0892, // Ene — temporada seca
  0.0851, // Feb
  0.0815, // Mar
  0.0768, // Abr — inicio lluvias
  0.0735, // May
  0.0748, // Jun
  0.0858, // Jul — veranillo San Juan
  0.0878, // Ago
  0.0792, // Sep — lluvias
  0.0748, // Oct
  0.0753, // Nov
  0.0862, // Dic — temporada seca
];

const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export default function MonthlyProductionChart({
  annualKwh,          // kWh/año (base del cálculo)
  monthlyKwhReal,     // array[12] de valores reales Google Solar (null si no disponible)
  onLoadReal,         // () => Promise<void> — carga datos reales GeoTIFF
  loadingReal,        // bool
  loadError,          // string | null
  monthlyConsumption, // kWh/mes del usuario (para mostrar línea de consumo)
}) {
  const [tooltip, setTooltip] = useState(null);

  if (!annualKwh || annualKwh <= 0) return null;

  const data = monthlyKwhReal?.length === 12
    ? monthlyKwhReal
    : MONTHLY_PROFILE.map(f => Math.round(annualKwh * f));

  const isReal = monthlyKwhReal?.length === 12;
  const maxVal = Math.max(...data, monthlyConsumption || 0);
  const BAR_W = 22;
  const GAP = 4;
  const CHART_H = 80;
  const CHART_W = 12 * (BAR_W + GAP) - GAP;

  return (
    <div style={{ background: 'rgba(7,9,15,0.92)', borderTop: `1px solid ${C.border}`, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 0.5 }}>
          PRODUCCIÓN MENSUAL ESTIMADA
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isReal
            ? <span style={{ fontSize: 9, color: '#4ade80', fontWeight: 700 }}>● Datos reales Google Solar</span>
            : <span style={{ fontSize: 9, color: C.muted }}>Perfil típico Colombia</span>
          }
          {!isReal && onLoadReal && (
            <button
              onClick={onLoadReal}
              disabled={loadingReal}
              style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 10, border: `1px solid ${C.teal}`,
                background: 'none', color: C.teal, cursor: loadingReal ? 'wait' : 'pointer', fontWeight: 700,
              }}
            >
              {loadingReal ? '⟳ Cargando…' : '☁ Datos reales'}
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div style={{ fontSize: 9, color: '#ff8a80', marginBottom: 6 }}>⚠ {loadError}</div>
      )}

      <div style={{ position: 'relative', overflowX: 'auto' }}>
        <svg width={CHART_W} height={CHART_H + 28} style={{ display: 'block', margin: '0 auto' }}>
          {/* Línea de consumo mensual */}
          {monthlyConsumption > 0 && (
            <>
              <line
                x1={0} y1={CHART_H - (monthlyConsumption / maxVal) * CHART_H}
                x2={CHART_W} y2={CHART_H - (monthlyConsumption / maxVal) * CHART_H}
                stroke="#ff8a80" strokeWidth={1} strokeDasharray="4,3" opacity={0.7}
              />
              <text
                x={CHART_W - 2} y={CHART_H - (monthlyConsumption / maxVal) * CHART_H - 3}
                fontSize={8} fill="#ff8a80" textAnchor="end"
              >
                consumo
              </text>
            </>
          )}

          {data.map((v, i) => {
            const barH = Math.max(2, (v / maxVal) * CHART_H);
            const x = i * (BAR_W + GAP);
            const y = CHART_H - barH;
            const coversPct = monthlyConsumption > 0 ? Math.min(100, Math.round(v / monthlyConsumption * 100)) : null;
            const barColor = coversPct == null
              ? C.orange
              : coversPct >= 100 ? '#4ade80' : coversPct >= 70 ? C.amber : C.orange;
            return (
              <g key={i}
                onMouseEnter={() => setTooltip({ i, v, coversPct })}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: 'default' }}
              >
                <rect x={x} y={y} width={BAR_W} height={barH} rx={2} fill={barColor} opacity={0.9} />
                <text x={x + BAR_W / 2} y={CHART_H + 10} fontSize={8} fill={C.muted} textAnchor="middle">
                  {MONTH_LABELS[i]}
                </text>
              </g>
            );
          })}

          {/* Tooltip */}
          {tooltip != null && (() => {
            const { i, v, coversPct } = tooltip;
            const x = i * (BAR_W + GAP);
            const tipX = Math.min(x, CHART_W - 80);
            const barH = (v / maxVal) * CHART_H;
            const tipY = CHART_H - barH - 38;
            return (
              <g>
                <rect x={tipX} y={Math.max(0, tipY)} width={78} height={32} rx={4}
                  fill="rgba(7,9,15,0.95)" stroke={C.border} strokeWidth={0.5} />
                <text x={tipX + 5} y={Math.max(12, tipY + 12)} fontSize={9} fill={C.text} fontWeight={700}>
                  {MONTH_LABELS[i]}: {v.toLocaleString('es-CO')} kWh
                </text>
                {coversPct != null && (
                  <text x={tipX + 5} y={Math.max(12, tipY + 24)} fontSize={8.5}
                    fill={coversPct >= 100 ? '#4ade80' : C.amber}>
                    {coversPct}% del consumo
                  </text>
                )}
              </g>
            );
          })()}
        </svg>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: C.muted }}>
        <span>Total anual: <strong style={{ color: C.text }}>{Math.round(annualKwh).toLocaleString('es-CO')} kWh</strong></span>
        <span>Promedio: <strong style={{ color: C.text }}>{Math.round(annualKwh / 12).toLocaleString('es-CO')} kWh/mes</strong></span>
      </div>
    </div>
  );
}
