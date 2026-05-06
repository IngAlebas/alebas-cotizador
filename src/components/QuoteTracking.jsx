import React, { useEffect, useState } from 'react';
import { C, fmt, fmtCOP } from '../constants';
import { getPublicQuote, QUOTE_STATUSES } from '../services/quotes';
import logo from '../logo.svg';

// Vista pública de seguimiento para el cliente. Validada con token en el query string.
// El admin genera el link desde el BackOffice y lo envía por email.
export default function QuoteTracking({ id, token }) {
  const [state, setState] = useState({ loading: true, quote: null, error: null });

  useEffect(() => {
    let cancelled = false;
    if (!id || !token) {
      setState({ loading: false, quote: null, error: 'Link incompleto. Verifica el correo recibido.' });
      return;
    }
    getPublicQuote({ id, token })
      .then(r => {
        if (cancelled) return;
        if (!r?.ok || !r.quote) {
          setState({ loading: false, quote: null, error: r?.reason || 'No se pudo cargar la cotización.' });
        } else {
          setState({ loading: false, quote: r.quote, error: null });
        }
      })
      .catch(e => {
        if (!cancelled) setState({ loading: false, quote: null, error: e?.message || 'Error de red' });
      });
    return () => { cancelled = true; };
  }, [id, token]);

  const ss = {
    wrap: { minHeight: '100vh', background: C.dark, color: C.text, fontFamily: 'inherit', padding: '24px 16px' },
    card: { maxWidth: 760, margin: '0 auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '28px 30px', marginBottom: 16 },
    h1: { fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 4px' },
    sub: { fontSize: 12, color: C.muted, marginBottom: 18 },
    section: { fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 },
    statKey: { fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
    statVal: { fontSize: 15, color: '#fff', fontWeight: 700, marginTop: 2 },
  };

  if (state.loading) {
    return (
      <div style={ss.wrap}>
        <div style={{ ...ss.card, textAlign: 'center', padding: '60px 30px' }}>
          <div style={{ fontSize: 14, color: C.muted }}>Cargando cotización…</div>
        </div>
      </div>
    );
  }

  if (state.error || !state.quote) {
    return (
      <div style={ss.wrap}>
        <div style={{ ...ss.card, textAlign: 'center', padding: '50px 30px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 6 }}>No pudimos cargar tu cotización</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>{state.error}</div>
          <a href="/?view=quoter" style={{ color: C.teal, fontSize: 12, textDecoration: 'none', borderBottom: `1px solid ${C.teal}55` }}>
            Solicitar una cotización nueva →
          </a>
        </div>
      </div>
    );
  }

  const q = state.quote;
  // Posición del estado actual en el ciclo
  const stIdx = QUOTE_STATUSES.indexOf(q.status);
  const isWon = q.status === 'ganada';
  const isLost = q.status === 'perdida';
  const isArchived = q.status === 'archivada';
  const stColor = isWon ? '#4ade80' : isLost ? '#f87171' : isArchived ? C.muted : C.yellow;

  return (
    <div style={ss.wrap}>
      {/* Header */}
      <div style={{ ...ss.card, paddingBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <img src={logo} alt="SolarHub" style={{ height: 36 }} />
          <span style={{ padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${stColor}22`, color: stColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {q.status}
          </span>
        </div>
        <h1 style={ss.h1}>Hola {q.customer?.name || 'cliente'}</h1>
        <div style={ss.sub}>
          Aquí puedes ver el estado de tu cotización solar #{q.id} ·
          {q.createdAt && ` creada el ${new Date(q.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        </div>

        {/* Step indicator */}
        {!isLost && !isArchived && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '14px 0 4px', flexWrap: 'wrap' }}>
            {['nuevo', 'contactado', 'propuesta', 'negociacion', 'ganada'].map((s, i) => {
              const cur = QUOTE_STATUSES.indexOf(s);
              const done = stIdx >= cur;
              const active = q.status === s;
              return (
                <React.Fragment key={s}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: done ? C.teal : 'transparent',
                      border: `2px solid ${done ? C.teal : C.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, color: done ? '#fff' : C.muted,
                    }}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? C.teal : (done ? C.text : C.muted) }}>{s}</span>
                  </div>
                  {i < 4 && <div style={{ flex: 1, height: 1, background: stIdx > cur ? C.teal : C.border, minWidth: 8 }} />}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Datos del sistema */}
      <div style={ss.card}>
        <div style={ss.section}>Tu sistema solar propuesto</div>
        <div style={ss.grid}>
          <div><div style={ss.statKey}>Capacidad</div><div style={ss.statVal}>{Number(q.kwp || 0).toFixed(2)} kWp</div></div>
          <div><div style={ss.statKey}>Paneles</div><div style={ss.statVal}>{q.numPanels || '—'}</div></div>
          <div><div style={ss.statKey}>Tipo</div><div style={ss.statVal}>{q.systemType || '—'}</div></div>
          <div><div style={ss.statKey}>Ubicación</div><div style={ss.statVal}>{q.dept || '—'}</div></div>
        </div>
        {q.results && (
          <div style={ss.grid}>
            <div><div style={ss.statKey}>Producción mensual</div><div style={ss.statVal}>{fmt(q.results.mp || 0)} kWh</div></div>
            <div><div style={ss.statKey}>Cobertura</div><div style={ss.statVal}>{q.results.cov || 0}%</div></div>
            <div><div style={ss.statKey}>CO₂ evitado</div><div style={ss.statVal}>{fmt(q.results.co2 || 0)} kg/año</div></div>
          </div>
        )}
        {q.budget && (
          <>
            <div style={{ ...ss.section, marginTop: 6 }}>Inversión y retorno</div>
            <div style={ss.grid}>
              <div><div style={ss.statKey}>Inversión total</div><div style={{ ...ss.statVal, color: C.yellow }}>{fmtCOP(q.budget.tot || q.totalCop)}</div></div>
              <div><div style={ss.statKey}>Ahorro anual</div><div style={{ ...ss.statVal, color: '#4ade80' }}>{fmtCOP(q.budget.sav || q.annualSavCop)}</div></div>
              <div><div style={ss.statKey}>Retorno</div><div style={ss.statVal}>{q.budget.roi || q.roiYears} años</div></div>
            </div>
          </>
        )}
        {q.panel && (
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
            Panel propuesto: <strong style={{ color: '#fff' }}>{q.panel.brand} {q.panel.model}</strong> · {q.panel.wp} Wp
          </div>
        )}
      </div>

      {/* Historial de seguimiento */}
      {Array.isArray(q.history) && q.history.length > 0 && (
        <div style={ss.card}>
          <div style={ss.section}>Avances de tu solicitud</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {q.history.slice().reverse().map((h, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${C.teal}66`, paddingLeft: 12 }}>
                <div style={{ fontSize: 10, color: C.muted }}>
                  {h.at ? new Date(h.at).toLocaleString('es-CO') : ''}
                </div>
                <div style={{ fontSize: 12, color: '#fff', marginTop: 2 }}>
                  Estado actualizado: <strong style={{ color: C.teal }}>{h.fromStatus}</strong> → <strong style={{ color: C.teal }}>{h.toStatus}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA contacto */}
      <div style={{ ...ss.card, textAlign: 'center', padding: '20px 30px' }}>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>¿Tienes preguntas sobre tu cotización?</div>
        <a href="mailto:info@solar-hub.co" style={{ color: C.teal, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          info@solar-hub.co
        </a>
      </div>
    </div>
  );
}
