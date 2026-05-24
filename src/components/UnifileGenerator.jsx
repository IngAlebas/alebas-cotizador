import React, { useRef, forwardRef } from 'react';
import { C } from '../constants';

// ─────────────────────────────────────────────────────────────────────────────
// Hardcoded accent colors not in C palette
// ─────────────────────────────────────────────────────────────────────────────
const RED    = '#f87171'; // negative terminal / AC negative
const GREEN  = '#4ade80'; // AC bus / grid
const BLUE   = '#60a5fa'; // battery / BMS
const NEUTRAL= '#aaa';    // ground / fuses
const BG0    = '#0a1628'; // deepest component background
const BG1    = '#0C1422'; // card background (= C.card)

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// IEC ground symbol centred at (cx, topY), lines going down
function GroundSymbol({ cx, topY, color = NEUTRAL }) {
  const lengths = [16, 11, 6];
  return (
    <g>
      {lengths.map((l, i) => (
        <line
          key={i}
          x1={cx - l / 2} y1={topY + i * 4}
          x2={cx + l / 2} y2={topY + i * 4}
          stroke={color} strokeWidth={i === 0 ? 1.5 : 1}
        />
      ))}
      <line x1={cx} y1={topY - 6} x2={cx} y2={topY} stroke={color} strokeWidth={1} />
    </g>
  );
}

// Downward-pointing triangle SPD symbol (apex at bottom)
function SpdSymbol({ cx, cy, color, label, labelAbove = true }) {
  // Base at top (y = cy - 10), apex at bottom (y = cy + 10)
  const bHalf = 10;
  const pts = `${cx - bHalf},${cy - 10} ${cx + bHalf},${cy - 10} ${cx},${cy + 10}`;
  const groundY = cy + 10;
  return (
    <g>
      <polygon points={pts} fill="none" stroke={color} strokeWidth={1.5} />
      {/* horizontal line at base */}
      <line x1={cx - bHalf} y1={cy - 10} x2={cx + bHalf} y2={cy - 10} stroke={color} strokeWidth={1} />
      {/* short stem down to ground */}
      <line x1={cx} y1={cy + 10} x2={cx} y2={groundY + 8} stroke={color} strokeWidth={1} />
      <GroundSymbol cx={cx} topY={groundY + 8} color={color} />
      {/* label */}
      {labelAbove ? (
        <text x={cx} y={cy - 16} textAnchor="middle" fontSize={7} fill={color}>{label}</text>
      ) : (
        <text x={cx} y={cy + 28} textAnchor="middle" fontSize={7} fill={color}>{label}</text>
      )}
    </g>
  );
}

// Breaker symbol: rect with diagonal
function BreakerSymbol({ cx, cy, color, labelLines = [] }) {
  const hw = 11, hh = 11;
  return (
    <g>
      <rect
        x={cx - hw} y={cy - hh}
        width={hw * 2} height={hh * 2}
        fill="none" stroke={color} strokeWidth={1.5} rx={2}
      />
      <line x1={cx - hw} y1={cy - hh} x2={cx + hw} y2={cy + hh} stroke={color} strokeWidth={1} />
      {labelLines.map((ln, i) => (
        <text key={i} x={cx} y={cy + hh + 10 + i * 9} textAnchor="middle" fontSize={7} fill={color}>
          {ln}
        </text>
      ))}
    </g>
  );
}

// Fuse symbol (IEC): rect with internal centre line
function FuseSymbol({ cx, cy }) {
  return (
    <g>
      <rect x={cx - 11} y={cy - 6} width={22} height={12} fill="none" stroke={NEUTRAL} strokeWidth={1.5} />
      <line x1={cx - 11} y1={cy} x2={cx + 11} y2={cy} stroke={NEUTRAL} strokeWidth={1} />
      <text x={cx} y={cy + 17} textAnchor="middle" fontSize={7} fill={C.muted}>Fus.</text>
    </g>
  );
}

// Panel array block for one string
function PanelBlock({ x, y, label, countText }) {
  const W = 80, H = 55;
  const rx = x, ry = y - H / 2;
  // Internal grid lines (4 cols × 3 rows → 3 vertical, 2 horizontal inner lines)
  const cellW = W / 4;
  const cellH = H / 3;
  return (
    <g>
      {/* String label above */}
      <text x={rx + W / 2} y={ry - 4} textAnchor="middle" fontSize={9} fill={C.teal} fontWeight="bold">
        {label}
      </text>
      {/* Panel rectangle */}
      <rect x={rx} y={ry} width={W} height={H} fill={BG0} stroke={C.teal} strokeWidth={1.5} rx={3} />
      {/* Vertical cell dividers */}
      {[1, 2, 3].map(i => (
        <line key={`v${i}`} x1={rx + i * cellW} y1={ry + 2} x2={rx + i * cellW} y2={ry + H - 2}
          stroke={C.teal} strokeWidth={0.5} opacity={0.5} />
      ))}
      {/* Horizontal cell dividers */}
      {[1, 2].map(i => (
        <line key={`h${i}`} x1={rx + 2} y1={ry + i * cellH} x2={rx + W - 2} y2={ry + i * cellH}
          stroke={C.teal} strokeWidth={0.5} opacity={0.5} />
      ))}
      {/* + / − terminals */}
      <text x={rx + W - 4} y={ry + 10} textAnchor="end" fontSize={8} fill={C.yellow} fontWeight="bold">+</text>
      <text x={rx + W - 4} y={ry + H - 4} textAnchor="end" fontSize={8} fill={RED}>−</text>
      {/* Count text */}
      <text x={rx + W / 2} y={ry + H / 2 + 4} textAnchor="middle" fontSize={8} fill={C.text}>
        {countText}
      </text>
    </g>
  );
}

// Bidirectional energy meter
function MeterSymbol({ cx, cy }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={16} fill={BG0} stroke={GREEN} strokeWidth={1.5} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={7} fill={GREEN} fontWeight="bold">kWh</text>
      {/* bidirectional arrows on left */}
      <text x={cx - 20} y={cy - 2} fontSize={8} fill={GREEN}>↑</text>
      <text x={cx - 20} y={cy + 8} fontSize={8} fill={GREEN}>↓</text>
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize={7} fill={GREEN}>Medidor</text>
      <text x={cx} y={cy + 39} textAnchor="middle" fontSize={7} fill={GREEN}>bidireccional</text>
    </g>
  );
}

// Distribution panel: rect with 3 small breaker icons
function PanelDistSymbol({ cx, cy }) {
  const hw = 14, hh = 20;
  return (
    <g>
      <rect x={cx - hw} y={cy - hh} width={hw * 2} height={hh * 2}
        fill={BG0} stroke={C.text} strokeWidth={1.5} rx={2} />
      {/* 3 mini breakers */}
      {[-9, 0, 9].map((dy, i) => (
        <g key={i}>
          <rect x={cx - 6} y={cy + dy - 3} width={12} height={6}
            fill="none" stroke={C.muted} strokeWidth={0.8} />
          <line x1={cx - 6} y1={cy + dy - 3} x2={cx + 6} y2={cy + dy + 3}
            stroke={C.muted} strokeWidth={0.6} />
        </g>
      ))}
      <text x={cx} y={cy + hh + 10} textAnchor="middle" fontSize={7} fill={C.muted}>Tablero</text>
    </g>
  );
}

// Grid connection symbol: 3 vertical parallel lines
function GridSymbol({ cx, cy, label2 }) {
  const lineH = 24;
  return (
    <g>
      {[-5, 0, 5].map((dx, i) => (
        <line key={i}
          x1={cx + dx} y1={cy - lineH / 2}
          x2={cx + dx} y2={cy + lineH / 2}
          stroke={GREEN} strokeWidth={1.5} />
      ))}
      <text x={cx} y={cy + lineH / 2 + 10} textAnchor="middle" fontSize={8} fill={GREEN}>Red / OR</text>
      {label2 && (
        <text x={cx} y={cy + lineH / 2 + 20} textAnchor="middle" fontSize={7} fill={GREEN}>{label2}</text>
      )}
    </g>
  );
}

// Battery IEC symbol group
function BatteryBankSymbol({ x, y, width, qty, kwh, brand, model }) {
  const lineSpacing = 8;
  const lineCount = 6;
  const totalH = lineSpacing * (lineCount - 1);
  const startY = y + 10;

  return (
    <g>
      {/* Dashed outer rect */}
      <rect x={x} y={y} width={width} height={60}
        fill="none" stroke={BLUE} strokeWidth={1} strokeDasharray="3,2" rx={3} />
      {/* IEC cell lines: alternating long / short */}
      {Array.from({ length: lineCount }).map((_, i) => {
        const long = i % 2 === 0;
        const lineW = long ? width - 20 : (width - 20) / 2;
        const lx = x + 10 + (long ? 0 : (width - 20 - lineW) / 2);
        return (
          <line key={i}
            x1={lx} y1={startY + i * lineSpacing}
            x2={lx + lineW} y2={startY + i * lineSpacing}
            stroke={BLUE} strokeWidth={long ? 2 : 1} />
        );
      })}
      {/* + / − labels */}
      <text x={x + 4} y={y + 30} fontSize={10} fill={BLUE} fontWeight="bold">+</text>
      <text x={x + width - 8} y={y + 30} fontSize={10} fill={BLUE} fontWeight="bold">−</text>
      {/* Labels */}
      <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={8} fill={BLUE}>
        {qty}× {kwh}kWh
      </text>
      <text x={x + width / 2} y={y + 72} textAnchor="middle" fontSize={7} fill={C.muted}>
        {brand} {model}
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Technical Unifilar SVG
// ─────────────────────────────────────────────────────────────────────────────
function TechnicalUnifilar({ system, panel, inverter, battery, results, location, client, showTitle }) {
  const ns      = clamp(system?.ns || 1, 1, 20);
  const ppss    = system?.ppss || (system?.numPanels || 1);
  const numPanels = system?.numPanels || (ns * ppss);
  const kwp     = system?.kwp || results?.actKwp || 0;
  const sysType = system?.systemType || 'on-grid';
  const hasStorage = sysType === 'hybrid' || sysType === 'off-grid';
  const agpe    = sysType === 'on-grid' || sysType === 'hybrid';

  // Panel info
  const panelWp    = panel?.wp || 0;
  const panelBrand = panel?.brand || '—';
  const panelModel = panel?.model || '—';

  // Inverter info
  const invKw    = inverter?.kw || 0;
  const invBrand = inverter?.brand || '—';
  const invModel = inverter?.model || '—';

  // Battery info
  const batBrand = battery?.brand || '—';
  const batModel = battery?.model || '—';
  const batKwh   = battery?.kwh || 0;
  const batQty   = battery?.qty || 1;
  const batV     = battery?.voltage || 48;

  // Dimensions
  const topPad    = 30;
  const rowH      = 120;
  const invCenterY = topPad + 60 + ((ns - 1) * rowH) / 2;
  const bodyH     = topPad + 60 + (ns - 1) * rowH + 60;
  const batSectionH = hasStorage ? 200 : 0;
  const titleH    = showTitle ? 110 : 0;
  const svgH      = bodyH + batSectionH + titleH + 20;

  // X positions
  const panelX     = 20;
  const fuseX      = 220;
  const combX      = 284; // combiner bus centre
  const combBoxX   = 265;
  const combBoxW   = 38;
  const dcBreakerX = 330;
  const spdDcX     = 390;
  const inverterX  = 450;
  const invW       = 120;
  const invH       = 90;
  const spdAcX     = 620;
  const acBreakerX = 680;
  const meterX     = 760;
  const tableroX   = 840;
  const gridX      = 950;

  const battTopY    = invCenterY + 70;
  const battCenterY = battTopY + 80;
  const batW        = 100;
  const batX        = inverterX + 10;

  // Helper: row y centre for string i
  const rowY = i => topPad + 60 + i * rowH;

  // Title block Y start
  const titleY = svgH - titleH;

  // String count text
  const countText = ns > 1
    ? `${ppss}×${panelWp}Wp`
    : `${numPanels}×${panelWp}Wp`;

  return (
    <svg
      viewBox={`0 0 1100 ${svgH}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      {/* Background */}
      <rect x={0} y={0} width={1100} height={svgH} fill={C.dark} />

      {/* ── Panel arrays + fuses ─────────────────────────────────── */}
      {Array.from({ length: ns }).map((_, i) => {
        const cy = rowY(i);
        const lbl = ns > 1 ? `ST${i + 1}` : 'STRING';
        return (
          <g key={`string-${i}`}>
            {/* Panel block */}
            <PanelBlock x={panelX} y={cy} label={lbl} countText={countText} />
            {/* Wire from panel right to fuse left */}
            <line x1={panelX + 80} y1={cy} x2={fuseX - 11} y2={cy}
              stroke={C.yellow} strokeWidth={1.5} />
            {/* Fuse */}
            <FuseSymbol cx={fuseX} cy={cy} />
            {/* Wire from fuse right to combiner or DC breaker */}
            {ns > 1 ? (
              <line x1={fuseX + 11} y1={cy} x2={combBoxX + combBoxW} y2={cy}
                stroke={C.yellow} strokeWidth={1.5} />
            ) : (
              <line x1={fuseX + 11} y1={cy} x2={dcBreakerX - 11} y2={cy}
                stroke={C.yellow} strokeWidth={1.5} />
            )}
          </g>
        );
      })}

      {/* ── Combiner box (ns > 1) ────────────────────────────────── */}
      {ns > 1 && (
        <g>
          <rect
            x={combBoxX} y={topPad + 20}
            width={combBoxW} height={(ns - 1) * rowH + 80}
            fill={BG1} stroke={C.yellow} strokeWidth={1} strokeDasharray="4,3" rx={3}
          />
          {/* Vertical bus inside combiner */}
          <line
            x1={combX} y1={rowY(0)}
            x2={combX} y2={rowY(ns - 1)}
            stroke={C.yellow} strokeWidth={2}
          />
          {/* Horizontal taps into bus */}
          {Array.from({ length: ns }).map((_, i) => (
            <line key={i}
              x1={combBoxX + combBoxW} y1={rowY(i)}
              x2={combX} y2={rowY(i)}
              stroke={C.yellow} strokeWidth={1}
            />
          ))}
          {/* Output wire from combiner to DC breaker */}
          <line x1={combBoxX + combBoxW} y1={invCenterY}
            x2={dcBreakerX - 11} y2={invCenterY}
            stroke={C.yellow} strokeWidth={1.5} />
          {/* Label */}
          <text x={combX} y={topPad + 20 + (ns - 1) * rowH + 80 + 12}
            textAnchor="middle" fontSize={7} fill={C.yellow}>Caja</text>
          <text x={combX} y={topPad + 20 + (ns - 1) * rowH + 80 + 21}
            textAnchor="middle" fontSize={7} fill={C.yellow}>Combinadora</text>
        </g>
      )}

      {/* ── DC Main Breaker ──────────────────────────────────────── */}
      <line x1={dcBreakerX + 11} y1={invCenterY} x2={spdDcX - 12} y2={invCenterY}
        stroke={C.yellow} strokeWidth={1.5} />
      <BreakerSymbol cx={dcBreakerX} cy={invCenterY} color={C.yellow}
        labelLines={['Int. DC', 'principal']} />

      {/* ── DC SPD ───────────────────────────────────────────────── */}
      <SpdSymbol cx={spdDcX} cy={invCenterY} color={C.orange} label="SPD DC" labelAbove={true} />
      {/* Wire from SPD DC to inverter left */}
      <line x1={spdDcX + 10} y1={invCenterY} x2={inverterX} y2={invCenterY}
        stroke={C.yellow} strokeWidth={1.5} />

      {/* ── Inverter ─────────────────────────────────────────────── */}
      {(() => {
        const ix = inverterX;
        const iy = invCenterY - invH / 2;
        const isHybrid = sysType === 'hybrid' || sysType === 'off-grid';
        const invTitle = isHybrid ? 'INVERSOR/CARGADOR' : 'INVERSOR';
        return (
          <g>
            {/* Title above */}
            <text x={ix + invW / 2} y={iy - 6} textAnchor="middle" fontSize={8} fill={C.teal} fontWeight="bold">
              {invTitle}
            </text>
            {/* Outer rect */}
            <rect x={ix} y={iy} width={invW} height={invH}
              fill={BG0} stroke={C.teal} strokeWidth={2} rx={4} />
            {/* DC/AC divider */}
            <line x1={ix + invW / 2} y1={iy + 4} x2={ix + invW / 2} y2={iy + invH - 4}
              stroke={C.teal} strokeWidth={1} strokeDasharray="3,2" opacity={0.6} />
            {/* DC side */}
            <text x={ix + 22} y={invCenterY - 6} textAnchor="middle" fontSize={16} fill={C.yellow} fontWeight="bold">≡</text>
            <text x={ix + 22} y={invCenterY + 12} textAnchor="middle" fontSize={7} fill={C.muted}>DC</text>
            {/* Arrow */}
            <text x={ix + invW / 2} y={invCenterY + 5} textAnchor="middle" fontSize={12} fill={C.text}>→</text>
            {/* AC side */}
            <text x={ix + invW - 22} y={invCenterY - 4} textAnchor="middle" fontSize={20} fill={GREEN} fontWeight="bold">~</text>
            <text x={ix + invW - 22} y={invCenterY + 12} textAnchor="middle" fontSize={7} fill={C.muted}>AC</text>
            {/* Power label at bottom */}
            <text x={ix + invW / 2} y={iy + invH - 16} textAnchor="middle" fontSize={10} fill={C.text} fontWeight="bold">
              {invKw} kW
            </text>
            <text x={ix + invW / 2} y={iy + invH - 6} textAnchor="middle" fontSize={7} fill={C.muted}>
              {invBrand} {invModel}
            </text>
            {/* Ground */}
            <GroundSymbol cx={ix + invW / 2} topY={iy + invH + 4} />
            {/* Battery wire (if storage) */}
            {isHybrid && (
              <>
                <line x1={ix + invW / 2} y1={iy + invH}
                  x2={ix + invW / 2} y2={battTopY}
                  stroke={BLUE} strokeWidth={1.5} />
                {/* Bidirectional arrows on wire */}
                <text x={ix + invW / 2 + 4} y={iy + invH + 20} fontSize={9} fill={BLUE}>↓</text>
                <text x={ix + invW / 2 + 4} y={iy + invH + 34} fontSize={9} fill={BLUE}>↑</text>
              </>
            )}
          </g>
        );
      })()}

      {/* ── Battery BMS + Bank (hybrid/off-grid) ─────────────────── */}
      {hasStorage && (
        <g>
          {/* BMS */}
          <rect x={batX} y={battTopY} width={batW} height={35}
            fill={BG0} stroke={BLUE} strokeWidth={1.5} rx={3} />
          <text x={batX + batW / 2} y={battTopY + 22} textAnchor="middle"
            fontSize={10} fill={BLUE} fontWeight="bold">BMS</text>
          {/* Wire BMS to battery bank */}
          <line x1={batX + batW / 2} y1={battTopY + 35} x2={batX + batW / 2} y2={battTopY + 50}
            stroke={BLUE} strokeWidth={1.5} />
          {/* Battery bank */}
          <BatteryBankSymbol
            x={batX} y={battTopY + 50}
            width={batW} qty={batQty} kwh={batKwh}
            brand={batBrand} model={batModel}
          />
          {/* Ground under battery */}
          <GroundSymbol cx={batX + batW / 2} topY={battTopY + 125} color={BLUE} />
        </g>
      )}

      {/* ── AC SPD ───────────────────────────────────────────────── */}
      {/* Wire from inverter right to SPD AC */}
      <line x1={inverterX + invW} y1={invCenterY} x2={spdAcX - 10} y2={invCenterY}
        stroke={GREEN} strokeWidth={1.5} />
      <SpdSymbol cx={spdAcX} cy={invCenterY} color={C.orange} label="SPD AC" labelAbove={true} />

      {/* ── AC Main Breaker ──────────────────────────────────────── */}
      <line x1={spdAcX + 10} y1={invCenterY} x2={acBreakerX - 11} y2={invCenterY}
        stroke={GREEN} strokeWidth={1.5} />
      <BreakerSymbol cx={acBreakerX} cy={invCenterY} color={GREEN}
        labelLines={['Int. AC', 'principal']} />

      {/* ── Bidirectional Meter ──────────────────────────────────── */}
      <line x1={acBreakerX + 11} y1={invCenterY} x2={meterX - 16} y2={invCenterY}
        stroke={GREEN} strokeWidth={1.5} />
      <MeterSymbol cx={meterX} cy={invCenterY} />

      {/* ── Distribution Panel ──────────────────────────────────── */}
      <line x1={meterX + 16} y1={invCenterY} x2={tableroX - 14} y2={invCenterY}
        stroke={GREEN} strokeWidth={1.5} />
      <PanelDistSymbol cx={tableroX} cy={invCenterY} />

      {/* ── Grid ────────────────────────────────────────────────── */}
      <line x1={tableroX + 14} y1={invCenterY} x2={gridX - 10} y2={invCenterY}
        stroke={GREEN} strokeWidth={1.5} />
      <GridSymbol cx={gridX} cy={invCenterY} label2={agpe ? 'AGPE' : null} />

      {/* ── Ground at combiner (ns > 1) / DC breaker ────────────── */}
      <GroundSymbol cx={dcBreakerX} topY={invCenterY + 15} />

      {/* ── Title block ─────────────────────────────────────────── */}
      {showTitle && (
        <g>
          <rect x={0} y={titleY} width={1100} height={titleH}
            fill={BG0} stroke={C.teal} strokeWidth={1} />
          {/* Vertical separator */}
          <line x1={200} y1={titleY} x2={200} y2={titleY + titleH} stroke={C.teal} strokeWidth={0.5} />
          {/* Rows */}
          {[
            ['PROYECTO:', `${client?.name || '—'}  —  ${client?.company || '—'}`],
            ['DIRECCIÓN:', `${location?.address || '—'}, ${location?.city || '—'}, ${location?.dept || '—'}`],
            ['SISTEMA:', `${sysType}  ·  ${kwp} kWp  ·  ${numPanels} paneles`],
            ['PANEL:', `${panelBrand} ${panelModel} ${panelWp}Wp  —  INV: ${invBrand} ${invModel} ${invKw}kW`],
            ['REFERENCIA:', 'RETIE 2013 · CREG 174/2021 · NEC 690 · IEC 60617'],
            ['FECHA:', new Date().toLocaleDateString('es-CO')],
          ].map(([lbl, val], i) => (
            <g key={i}>
              <line x1={0} y1={titleY + i * 18 + 18} x2={1100} y2={titleY + i * 18 + 18}
                stroke={C.teal} strokeWidth={0.3} opacity={0.4} />
              <text x={8} y={titleY + i * 18 + 13}
                fontSize={8} fill={C.muted} fontWeight="bold">{lbl}</text>
              <text x={208} y={titleY + i * 18 + 13}
                fontSize={8} fill={C.text}>{val}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Client simplified layout SVG
// ─────────────────────────────────────────────────────────────────────────────
function ClientLayout({ system, panel, inverter, battery, results }) {
  const sysType   = system?.systemType || 'on-grid';
  const numPanels = system?.numPanels || results?.numPanels || 0;
  const kwp       = system?.kwp || results?.actKwp || 0;
  const hasStorage = sysType === 'hybrid' || sysType === 'off-grid';
  const isOnGrid  = sysType === 'on-grid' || sysType === 'hybrid';

  const panelBrand  = panel?.brand || '—';
  const invKw       = inverter?.kw || 0;
  const invBrand    = inverter?.brand || '—';
  const invModel    = inverter?.model || '—';
  const mp          = results?.mp || 0;
  const cov         = results?.cov || 0;
  const batKwh      = battery?.kwh || 0;
  const batQty      = battery?.qty || 1;
  const batBrand    = battery?.brand || '—';
  const totalBatKwh = (batQty * batKwh).toFixed(1);

  // Derived metrics
  const co2  = ((mp * 12 * 0.126) / 1000).toFixed(1);
  const roi  = kwp > 0 ? Math.round((kwp * 2800000) / (mp * 12 * 720)) : '—';

  // SVG dimensions
  const W = 1100;
  const H = hasStorage ? 420 : 340;

  // Block layout
  const blockW  = 160;
  const blockH  = 130;
  const blockY  = 40;
  const arrowW  = 60;

  // Main row: panels → inverter → loads
  const panelBX   = 40;
  const invBX     = panelBX + blockW + arrowW;
  const loadsBX   = invBX + blockW + arrowW;

  // Secondary row (below inverter): battery / grid
  const secY      = blockY + blockH + 60;
  const batBX     = invBX;
  const gridBX    = loadsBX;

  // Arrow helper (fat polygon)
  function Arrow({ x1, y1, x2, y2 }) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const hw = 5; // half shaft width
    const headLen = 14, headW = 11;
    const shaftEnd = { x: x1 + ux * (len - headLen), y: y1 + uy * (len - headLen) };
    const pts = [
      `${x1 + nx * hw},${y1 + ny * hw}`,
      `${shaftEnd.x + nx * hw},${shaftEnd.y + ny * hw}`,
      `${shaftEnd.x + nx * headW},${shaftEnd.y + ny * headW}`,
      `${x2},${y2}`,
      `${shaftEnd.x - nx * headW},${shaftEnd.y - ny * headW}`,
      `${shaftEnd.x - nx * hw},${shaftEnd.y - ny * hw}`,
      `${x1 - nx * hw},${y1 - ny * hw}`,
    ].join(' ');
    return <polygon points={pts} fill={C.orange} opacity={0.9} />;
  }

  // Bidirectional vertical arrow (two arrows)
  function BiArrow({ x, y1, y2 }) {
    const mid = (y1 + y2) / 2;
    return (
      <g>
        <Arrow x1={x} y1={mid - 4} x2={x} y2={y1 + 10} />
        <Arrow x1={x} y1={mid + 4} x2={x} y2={y2 - 10} />
      </g>
    );
  }

  // Block renderer
  function Block({ x, y, w, h, icon, borderColor, mainText, subText }) {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h}
          fill={BG0} stroke={borderColor} strokeWidth={2} rx={12} />
        <text x={x + w / 2} y={y + 38} textAnchor="middle" fontSize={28}>{icon}</text>
        <text x={x + w / 2} y={y + 68} textAnchor="middle"
          fontSize={14} fill={C.yellow} fontWeight="bold">{mainText}</text>
        <text x={x + w / 2} y={y + 86} textAnchor="middle"
          fontSize={11} fill={C.muted}>{subText}</text>
      </g>
    );
  }

  // Summary bar Y
  const barY = H - 68;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      {/* Background */}
      <rect x={0} y={0} width={W} height={H} fill={C.dark} />

      {/* ── Main row ─────────────────────────────────────────────── */}
      {/* Panels block */}
      <Block
        x={panelBX} y={blockY} w={blockW} h={blockH}
        icon="☀"
        borderColor={C.teal}
        mainText={`${numPanels} paneles`}
        subText={`${kwp} kWp · ${panelBrand}`}
      />
      {/* Arrow panels → inverter */}
      <Arrow
        x1={panelBX + blockW + 6} y1={blockY + blockH / 2}
        x2={invBX - 6} y2={blockY + blockH / 2}
      />

      {/* Inverter block */}
      <Block
        x={invBX} y={blockY} w={blockW} h={blockH}
        icon="⚡"
        borderColor={C.yellow}
        mainText={`${invKw} kW`}
        subText={`${invBrand} ${invModel}`}
      />
      {/* Arrow inverter → loads */}
      <Arrow
        x1={invBX + blockW + 6} y1={blockY + blockH / 2}
        x2={loadsBX - 6} y2={blockY + blockH / 2}
      />

      {/* Loads block */}
      <Block
        x={loadsBX} y={blockY} w={blockW} h={blockH}
        icon="🏠"
        borderColor={GREEN}
        mainText={`${mp} kWh/mes`}
        subText={`Producción estimada · ${cov}% cob.`}
      />

      {/* ── Secondary row ────────────────────────────────────────── */}
      {/* Battery (hybrid/off-grid) */}
      {hasStorage && (
        <>
          <BiArrow
            x={invBX + blockW / 2}
            y1={blockY + blockH + 4}
            y2={secY - 4}
          />
          <Block
            x={batBX} y={secY} w={blockW} h={blockH}
            icon="🔋"
            borderColor={BLUE}
            mainText={`${totalBatKwh} kWh`}
            subText={`${batBrand} · autonomía`}
          />
        </>
      )}

      {/* Grid (on-grid/hybrid) */}
      {isOnGrid && (
        <>
          <BiArrow
            x={loadsBX + blockW / 2}
            y1={blockY + blockH + 4}
            y2={secY - 4}
          />
          <Block
            x={gridBX} y={secY} w={blockW} h={blockH}
            icon="🔌"
            borderColor={GREEN}
            mainText="Red pública"
            subText={cov >= 100 ? 'Excedentes → OR' : 'Complemento red'}
          />
        </>
      )}

      {/* ── Summary bar ──────────────────────────────────────────── */}
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={BG1} />
          <stop offset="50%" stopColor={BG1} />
          <stop offset="100%" stopColor={BG1} />
        </linearGradient>
      </defs>
      <rect x={20} y={barY} width={W - 40} height={54} fill="url(#barGrad)"
        stroke={C.teal} strokeWidth={1} rx={10} />

      {[
        { icon: '☀', val: `${kwp} kWp`, lbl: 'Sistema' },
        { icon: '⚡', val: `${mp} kWh/mes`, lbl: 'Producción' },
        { icon: '💰', val: `${roi} años`, lbl: 'ROI estimado' },
        { icon: '🌱', val: `${co2} ton/año`, lbl: 'CO₂ evitado' },
      ].map(({ icon, val, lbl }, idx) => {
        const colW = (W - 40) / 4;
        const cx = 20 + idx * colW + colW / 2;
        return (
          <g key={idx}>
            {idx > 0 && (
              <line x1={20 + idx * colW} y1={barY + 8}
                x2={20 + idx * colW} y2={barY + 46}
                stroke={C.teal} strokeWidth={0.5} opacity={0.5} />
            )}
            <text x={cx} y={barY + 22} textAnchor="middle" fontSize={13}>{icon}</text>
            <text x={cx} y={barY + 38} textAnchor="middle" fontSize={12} fill={C.yellow} fontWeight="bold">
              {val}
            </text>
            <text x={cx} y={barY + 50} textAnchor="middle" fontSize={9} fill={C.muted}>{lbl}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported component
// ─────────────────────────────────────────────────────────────────────────────
const UnifileGenerator = forwardRef(function UnifileGenerator(
  {
    system,
    panel,
    inverter,
    battery,
    results,
    location,
    client,
    mode = 'technical',
    showTitle = true,
    onExportSVG,
  },
  ref
) {
  const svgRef = useRef(null);

  // Merge forwarded ref with local ref
  function setRef(el) {
    svgRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  }

  function handleExport() {
    if (!svgRef.current || !onExportSVG) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgRef.current);
    onExportSVG(svgString);
  }

  const wrapStyle = {
    width: '100%',
    background: C.dark,
    borderRadius: 8,
    padding: 12,
    boxSizing: 'border-box',
  };

  const btnStyle = {
    marginTop: 8,
    padding: '4px 12px',
    fontSize: 12,
    background: 'none',
    border: `1px solid ${C.teal}`,
    color: C.teal,
    borderRadius: 4,
    cursor: 'pointer',
    display: 'block',
    marginLeft: 'auto',
  };

  // Inject ref into the rendered SVG via a wrapper div + querySelector
  // Both sub-components render their own <svg>; we capture the first child svg.
  const wrapRef = useRef(null);

  function setWrapRef(el) {
    wrapRef.current = el;
    if (el) {
      const svg = el.querySelector('svg');
      if (svg) {
        svgRef.current = svg;
        if (typeof ref === 'function') ref(svg);
        else if (ref) ref.current = svg;
      }
    }
  }

  return (
    <div style={wrapStyle}>
      <div ref={setWrapRef}>
        {mode === 'technical' ? (
          <TechnicalUnifilar
            system={system}
            panel={panel}
            inverter={inverter}
            battery={battery}
            results={results}
            location={location}
            client={client}
            showTitle={showTitle}
          />
        ) : (
          <ClientLayout
            system={system}
            panel={panel}
            inverter={inverter}
            battery={battery}
            results={results}
          />
        )}
      </div>
      {onExportSVG && (
        <button style={btnStyle} onClick={handleExport}>
          Exportar SVG
        </button>
      )}
    </div>
  );
});

export default UnifileGenerator;
