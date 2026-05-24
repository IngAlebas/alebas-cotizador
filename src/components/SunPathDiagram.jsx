// Diagrama de la trayectoria solar — semicírculo con horas, azimuth del techo
// y altura solar para Colombia (lat ~4°N). Reemplaza la línea borrosa sobre el
// satélite con una visualización clara y educativa.
//
// Muestra:
//   - Arco semicircular de 6am (E) → cenit → 6pm (O)
//   - Marcadores de horas (6/9/12/15/18) con sol amarillo
//   - Línea vertical indicando el azimuth principal del techo
//   - Hora actual marcada con pulse animado
//   - Leyenda con horas pico de generación
//
// Diseño compacto: 100% width, height ~140px. Cabe debajo del mapa.

import React from 'react';
import { C } from '../constants';

export default function SunPathDiagram({ azimuthDeg = 180, sunshineHoursYear = null, latitude = 4 }) {
  const W = 600, H = 160;
  const cx = W / 2, cy = H - 10; // base del arco (horizonte)
  const r = (W / 2) - 30;
  const peakY = cy - r * 0.85; // altura máxima del arco al mediodía

  // Hora actual local (Colombia UTC-5, no DST)
  const now = new Date();
  const hourLocal = now.getHours() + now.getMinutes() / 60;
  const isDay = hourLocal >= 6 && hourLocal <= 18;
  const dayProgress = isDay ? (hourLocal - 6) / 12 : null; // 0 = 6am · 1 = 6pm

  const sunPos = (progress) => {
    // Arco semicircular: progress 0..1 → angle 180° (E) → 0° (W) en CSS
    const angle = Math.PI * (1 - progress); // π = E (left), 0 = W (right)
    return {
      x: cx + Math.cos(angle) * r,
      y: cy - Math.sin(angle) * r * 0.85, // 0.85 para hacer arco más bajo
    };
  };

  // Horas de referencia para mostrar
  const hoursToMark = [6, 9, 12, 15, 18];

  // Convertir azimuth (0=N, 90=E, 180=S, 270=O) a posición en arco
  // El techo "mira" hacia su azimuth. En el arco mostramos:
  //   E (oriente) a la izquierda, O (poniente) a la derecha
  // El techo orientado hacia el sur (180°) aparece de frente al sol al mediodía.
  // Para visualizar la "exposición" del techo: si azimuth está entre 90-270 (Este, Sur, Oeste)
  // hay buena exposición. Marcamos eso visualmente.

  // Azimuth proyectado al arco horizontal (rango -90° a +90° desde el sur)
  // 90° (E) → -90° proyección (izq) | 180° (S) → 0° (centro) | 270° (O) → +90° (der)
  const azFromSouth = azimuthDeg - 180; // -90 a +90 si es buen rango (E a O via S)
  // Limitamos a -90..90 para no salir del arco
  const azClamped = Math.max(-90, Math.min(90, azFromSouth));
  // Posición del techo en el arco: como ángulo desde la vertical
  const techoAngle = (90 - azClamped) / 180; // 0..1 (este..oeste)
  const techoMarker = sunPos(techoAngle);

  // Etiqueta cardinal del azimuth
  const cardinal = (() => {
    const a = ((azimuthDeg % 360) + 360) % 360;
    if (a < 22.5 || a >= 337.5) return 'Norte';
    if (a < 67.5) return 'Noreste';
    if (a < 112.5) return 'Este';
    if (a < 157.5) return 'Sureste';
    if (a < 202.5) return 'Sur';
    if (a < 247.5) return 'Suroeste';
    if (a < 292.5) return 'Oeste';
    return 'Noroeste';
  })();
  const orientationOk = azimuthDeg >= 90 && azimuthDeg <= 270;

  return (
    <div style={{
      background: `linear-gradient(180deg, ${C.teal}10 0%, ${C.teal}05 50%, ${C.yellow}08 100%)`,
      border: `1px solid ${C.teal}33`,
      borderRadius: 9,
      padding: '14px 16px',
      marginTop: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>☀</span>
        <strong style={{ fontSize: 13, color: C.teal }}>Trayectoria del sol sobre tu techo</strong>
        <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>
          Colombia (lat ~{Math.abs(latitude).toFixed(1)}°N) · sol cruza casi por el cenit
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" preserveAspectRatio="xMidYMid meet" aria-label="Trayectoria solar">
        <defs>
          <radialGradient id="sunGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFD93D" />
            <stop offset="80%" stopColor="#FF8C00" />
            <stop offset="100%" stopColor="#FF8C0000" />
          </radialGradient>
          <linearGradient id="dayBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFE89A" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#FF8C00" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Cielo bajo el arco */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r * 0.85} 0 0 1 ${cx + r} ${cy} L ${cx + r} ${cy} L ${cx - r} ${cy} Z`}
          fill="url(#dayBg)"
        />

        {/* Línea del horizonte (suelo) */}
        <line x1="0" y1={cy} x2={W} y2={cy} stroke={C.muted} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />

        {/* Arco semicircular del sol */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r * 0.85} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={C.yellow}
          strokeWidth="2"
          strokeDasharray="5 4"
          opacity="0.7"
        />

        {/* Posiciones del sol en horas clave */}
        {hoursToMark.map(h => {
          const progress = (h - 6) / 12;
          const pos = sunPos(progress);
          const isPeak = h === 12;
          return (
            <g key={h}>
              <circle
                cx={pos.x} cy={pos.y}
                r={isPeak ? 14 : 9}
                fill={isPeak ? 'url(#sunGradient)' : C.yellow}
                opacity={isPeak ? 1 : 0.85}
              />
              {isPeak && (
                <>
                  {/* Rayos en el cenit */}
                  {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
                    const rad = (deg * Math.PI) / 180;
                    const x1 = pos.x + Math.cos(rad) * 16;
                    const y1 = pos.y + Math.sin(rad) * 16;
                    const x2 = pos.x + Math.cos(rad) * 22;
                    const y2 = pos.y + Math.sin(rad) * 22;
                    return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FF8C00" strokeWidth="1.5" strokeLinecap="round" />;
                  })}
                </>
              )}
              <text x={pos.x} y={pos.y + (isPeak ? 32 : 22)} textAnchor="middle" fill={C.text} fontSize="10" fontWeight="700">
                {h}:00
              </text>
            </g>
          );
        })}

        {/* Cardinales E - O */}
        <text x={cx - r - 4} y={cy + 4} textAnchor="end" fill={C.muted} fontSize="11" fontWeight="800">E</text>
        <text x={cx + r + 4} y={cy + 4} textAnchor="start" fill={C.muted} fontSize="11" fontWeight="800">O</text>

        {/* Marcador del azimuth principal del techo */}
        <g>
          <line
            x1={techoMarker.x} y1={cy}
            x2={techoMarker.x} y2={techoMarker.y - 6}
            stroke={orientationOk ? '#4ade80' : C.orange}
            strokeWidth="2.5"
            strokeDasharray="4 2"
          />
          <polygon
            points={`${techoMarker.x},${techoMarker.y - 8} ${techoMarker.x - 6},${techoMarker.y + 2} ${techoMarker.x + 6},${techoMarker.y + 2}`}
            fill={orientationOk ? '#4ade80' : C.orange}
          />
          <rect
            x={techoMarker.x - 38}
            y={cy + 14}
            width="76"
            height="20"
            rx="4"
            fill={orientationOk ? '#4ade8022' : `${C.orange}22`}
            stroke={orientationOk ? '#4ade80' : C.orange}
            strokeWidth="1"
          />
          <text
            x={techoMarker.x}
            y={cy + 27}
            textAnchor="middle"
            fill={orientationOk ? '#4ade80' : C.orange}
            fontSize="10"
            fontWeight="700"
          >
            🏠 {cardinal} ({Math.round(azimuthDeg)}°)
          </text>
        </g>

        {/* Sol en posición actual (si es de día) */}
        {dayProgress != null && (() => {
          const pos = sunPos(dayProgress);
          return (
            <g>
              <circle cx={pos.x} cy={pos.y} r="7" fill="#FFD93D" opacity="0.4">
                <animate attributeName="r" values="7;12;7" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={pos.x} cy={pos.y} r="6" fill="#FF8C00" />
              <text x={pos.x} y={pos.y - 12} textAnchor="middle" fill="#FF8C00" fontSize="9" fontWeight="700">
                ahora · {Math.floor(hourLocal)}:{String(Math.round((hourLocal % 1) * 60)).padStart(2, '0')}
              </text>
            </g>
          );
        })()}
      </svg>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 8,
        fontSize: 11,
        color: C.muted,
        lineHeight: 1.5,
      }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <strong style={{ color: orientationOk ? '#4ade80' : C.orange }}>
            {orientationOk ? '✓ Buena orientación' : '⚠ Orientación no óptima'}
          </strong>
          <br />
          Tu techo apunta al <strong style={{ color: C.text }}>{cardinal}</strong> ({Math.round(azimuthDeg)}°).{' '}
          {orientationOk
            ? 'Recibe sol directo gran parte del día.'
            : 'Considera estructura inclinada para mejorar exposición.'}
        </div>
        {sunshineHoursYear != null && (
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <strong style={{ color: C.yellow }}>☀ {Math.round(sunshineHoursYear).toLocaleString('es-CO')} h sol/año</strong>
            <br />
            Promedio de horas de sol efectivas que recibe esta cubierta según Google Solar.
          </div>
        )}
      </div>
    </div>
  );
}
