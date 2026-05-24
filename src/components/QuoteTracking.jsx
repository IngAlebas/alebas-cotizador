import React, { useState, useEffect } from 'react';
import { C } from '../constants';

const STATUS_META = {
  nuevo:       { label: 'Solicitud recibida',    color: C.muted,    icon: '📋' },
  asignado:    { label: 'Asignado a técnico',     color: C.yellow,   icon: '👷' },
  en_revision: { label: 'En revisión técnica',   color: C.orange,   icon: '🔄' },
  aprobado:    { label: 'Aprobado',               color: C.teal,     icon: '✅' },
  ganado:      { label: 'Proyecto confirmado',    color: '#4ade80',  icon: '🎉' },
};

const PIPELINE = ['nuevo', 'asignado', 'en_revision', 'aprobado', 'ganado'];

function StatusTimeline({ status }) {
  const currentIdx = PIPELINE.indexOf(status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
      {PIPELINE.map((step, idx) => {
        const meta = STATUS_META[step] || {};
        const done = idx <= currentIdx;
        const active = idx === currentIdx;
        return (
          <React.Fragment key={step}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80, flex: 1 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: done ? `${meta.color}22` : `${C.muted}11`,
                border: `2px solid ${done ? meta.color : C.muted + '33'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: active ? 18 : 14,
                transition: 'all 0.3s',
                boxShadow: active ? `0 0 0 3px ${meta.color}22` : 'none',
              }}>
                {meta.icon}
              </div>
              <div style={{
                fontSize: 9, marginTop: 6, textAlign: 'center',
                color: done ? meta.color : C.muted,
                fontWeight: active ? 700 : 400,
                lineHeight: 1.3,
                maxWidth: 72,
              }}>
                {meta.label}
              </div>
            </div>
            {idx < PIPELINE.length - 1 && (
              <div style={{
                flex: 1, height: 2, minWidth: 16, maxWidth: 40,
                background: idx < currentIdx ? C.teal : `${C.muted}22`,
                margin: '0 2px',
                marginBottom: 22,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function QuoteTracking({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quote, setQuote] = useState(null);
  const [UnifilarComp, setUnifilarComp] = useState(null);
  const [showLayout, setShowLayout] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Fetch quote data
  useEffect(() => {
    if (!token) {
      setError('Token no proporcionado. Revisa el enlace de seguimiento.');
      setLoading(false);
      return;
    }
    const base = process.env.REACT_APP_N8N_BASE_URL;
    if (!base) {
      setError('Configuración del servidor no disponible.');
      setLoading(false);
      return;
    }
    fetch(`${base}/quote-public?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok || !data.quote) {
          setError('Enlace no válido o expirado. Contacta a ALEBAS Ingeniería.');
        } else {
          setQuote(data.quote);
        }
      })
      .catch(() => setError('Error de conexión. Verifica tu internet e intenta de nuevo.'))
      .finally(() => setLoading(false));
  }, [token]);

  // Lazy-load UnifileGenerator
  useEffect(() => {
    import('./UnifileGenerator')
      .then(m => setUnifilarComp(() => m.default))
      .catch(() => {});
  }, []);

  async function handleSubmitReview() {
    if (!reviewRating) return;
    setSubmittingReview(true);
    try {
      const base = process.env.REACT_APP_N8N_BASE_URL;
      await fetch(`${base}/installer-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          quote_id: quote.id,
          installer_id: quote.technician_id,
          rating: reviewRating,
          comment: reviewComment,
          client_name: quote.client_name || 'Cliente SolarHub'
        })
      });
      setReviewSubmitted(true);
    } catch(e) { console.error(e); }
    setSubmittingReview(false);
  }

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.teal}33`, borderTop: `3px solid ${C.teal}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ color: C.muted, fontSize: 13 }}>Cargando tu cotización...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: C.card, border: `1px solid ${C.teal}33`, borderRadius: 12, padding: '36px 32px', maxWidth: 440, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>☀</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Seguimiento no disponible</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{error}</div>
          <div style={{ marginTop: 20, fontSize: 11, color: C.teal }}>ing@alebas.co · solar-hub.co</div>
        </div>
      </div>
    );
  }

  // ── Data aliases ──
  const p = quote.payload || {};
  const status = quote.status || 'nuevo';
  const statusMeta = STATUS_META[status] || STATUS_META.nuevo;

  // System fields — handle both flat fields and nested payload.results
  const numPanels  = quote.num_panels  || p.results?.numPanels  || null;
  const kwp        = quote.kwp         || p.results?.actKwp     || null;
  const mp         = quote.production_kwh_month || p.results?.mp || null;
  const cov        = quote.coverage_pct || p.results?.cov        || null;
  const totalCop   = quote.total_cop   || p.budget?.tot          || null;
  const annualSav  = quote.annual_sav_cop || p.budget?.sav       || null;
  const roiYears   = quote.roi_years   || p.budget?.roi          || null;
  const sysType    = quote.system_type || p.systemType           || null;

  const clientName = p.name || quote.name || '—';
  const city       = p.city || quote.city || '';
  const dept       = p.dept || quote.dept || '';

  const fmtCOP = v => v ? `$${Number(v).toLocaleString('es-CO')}` : '—';

  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: 'Outfit, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{
        background: C.card,
        padding: '16px 24px',
        borderBottom: `1px solid ${C.teal}33`,
        display: 'flex', alignItems: 'center', gap: 14,
        position: 'sticky', top: 0, zIndex: 50,
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
      }}>
        <span style={{ fontSize: 22 }}>☀</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.yellow, lineHeight: 1 }}>
            Solar<span style={{ color: '#fff' }}>Hub</span>
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Seguimiento de cotización · ALEBAS Ingeniería SAS</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: C.teal, background: `${C.teal}12`, padding: '4px 12px', borderRadius: 20, border: `1px solid ${C.teal}33` }}>
          #{quote.id}
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px 80px' }}>

        {/* ── Greeting ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
            Hola, {clientName} 👋
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {city && dept ? `${city}, ${dept} · ` : ''}
            {quote.created_at ? `Cotización del ${new Date(quote.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}
          </div>
        </div>

        {/* ── Current status badge ── */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 24, background: `${statusMeta.color}18`, color: statusMeta.color, border: `1px solid ${statusMeta.color}44` }}>
          {statusMeta.icon} {statusMeta.label}
        </div>

        {/* ── Timeline ── */}
        <div style={{ background: C.card, border: `1px solid ${C.teal}22`, borderRadius: 12, padding: '20px 20px 8px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
            Estado del proyecto
          </div>
          <StatusTimeline status={status} />
        </div>

        {/* ── System summary ── */}
        <div style={{ background: C.card, border: `1px solid ${C.teal}22`, borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 14 }}>
            ☀ Tu sistema solar
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {[
              ['Tipo de sistema', sysType],
              ['Capacidad', kwp ? `${kwp} kWp` : null],
              ['Paneles', numPanels ? `${numPanels} paneles` : null],
              ['Producción est.', mp ? `${Math.round(mp)} kWh/mes` : null],
              ['Cobertura', cov ? `${cov}%` : null],
              ['Inversión total', fmtCOP(totalCop)],
              ['Ahorro anual', fmtCOP(annualSav)],
              ['Retorno (ROI)', roiYears ? `${roiYears} años` : '—'],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} style={{ background: `${C.teal}08`, border: `1px solid ${C.teal}18`, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Layout del sistema (collapsible) ── */}
        {quote && p && (
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowLayout(s => !s)}
              style={{
                width: '100%', background: showLayout ? `${C.teal}22` : C.card,
                color: C.text, border: `1px solid ${C.teal}44`, borderRadius: 8,
                padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <span>📐 Ver layout de tu sistema</span>
              <span style={{ color: C.teal }}>{showLayout ? '▲' : '▼'}</span>
            </button>

            {showLayout && (
              <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.teal}22` }}>
                {UnifilarComp ? (
                  <UnifilarComp
                    mode="client"
                    showTitle={false}
                    system={{
                      systemType: sysType,
                      numPanels:  numPanels,
                      ns:         p.results?.ns,
                      ppss:       p.results?.ppss,
                      kwp:        kwp,
                    }}
                    panel={p.panel || {}}
                    inverter={p.results?.inv || p.inverter || {}}
                    battery={p.battery || null}
                    results={{
                      actKwp:    kwp,
                      numPanels: numPanels,
                      mp:        mp,
                      cov:       cov,
                    }}
                    location={{ city: p.city || city, dept: p.dept || dept, address: p.address }}
                    client={{ name: p.name || clientName, company: p.company }}
                  />
                ) : (
                  /* Fallback if UnifileGenerator not available */
                  <div style={{ background: C.card, padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      ['☀', 'Paneles',     `${numPanels || '—'} × ${p.panel?.wp || '—'} Wp`],
                      ['⚡', 'Inversor',    `${p.results?.inv?.kw || p.inverter?.kw || kwp || '—'} kW`],
                      ['📊', 'Producción',  `${mp || '—'} kWh/mes`],
                      ['✅', 'Cobertura',   `${cov || '—'}%`],
                    ].map(([icon, label, value]) => (
                      <div key={label} style={{ background: '#07090F', borderRadius: 8, padding: '12px 16px', border: `1px solid ${C.teal}33` }}>
                        <div style={{ fontSize: 20 }}>{icon}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{label}</div>
                        <div style={{ fontSize: 15, color: C.text, fontWeight: 700 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Notes / observations ── */}
        {quote.notes && (
          <div style={{ background: C.card, border: `1px solid ${C.teal}22`, borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Observaciones</div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{quote.notes}</div>
          </div>
        )}

        {/* ── Review section (appears when installation complete) ── */}
        {quote.status === 'ganada' && quote.technician_id && !reviewSubmitted && (
          <div style={{ marginTop: 32, background: C.card, borderRadius: 16, padding: 24, border: `1px solid ${C.teal}33`, marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>
              ¿Cómo fue tu experiencia con la instalación?
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
              Tu opinión ayuda a otros clientes a elegir un buen instalador
            </div>
            {/* Star rating */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[1,2,3,4,5].map(s => (
                <span key={s} onClick={() => setReviewRating(s)}
                  style={{ fontSize: 28, cursor: 'pointer', color: s <= reviewRating ? C.amber : C.muted, transition: 'color 0.15s' }}>★</span>
              ))}
            </div>
            <textarea
              placeholder="Cuéntanos sobre el proceso de instalación, el instalador, y cómo funciona tu sistema..."
              value={reviewComment} onChange={e => setReviewComment(e.target.value)}
              style={{ width: '100%', background: C.dark, border: `1px solid ${C.teal}33`, borderRadius: 10,
                color: C.text, padding: '10px 12px', fontSize: 14, fontFamily: 'Outfit', minHeight: 80,
                resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }}
            />
            <button onClick={handleSubmitReview} disabled={reviewRating === 0 || submittingReview}
              style={{ background: reviewRating > 0 ? C.teal : C.muted, color: '#fff', border: 'none',
                borderRadius: 10, padding: '10px 24px', fontWeight: 600, cursor: reviewRating > 0 ? 'pointer' : 'default',
                fontSize: 15, fontFamily: 'Outfit' }}>
              {submittingReview ? 'Enviando...' : 'Enviar calificación'}
            </button>
          </div>
        )}
        {reviewSubmitted && (
          <div style={{ marginTop: 24, background: `${'#4ade80'}15`, border: `1px solid ${'#4ade80'}40`, borderRadius: 12,
            padding: 20, color: '#4ade80', textAlign: 'center', fontWeight: 600, marginBottom: 16 }}>
            ✓ ¡Gracias por tu calificación! Tu opinión ayuda a la comunidad solar.
          </div>
        )}

        {/* ── Contact CTA ── */}
        <div style={{ background: `${C.teal}10`, border: `1px solid ${C.teal}33`, borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 6 }}>¿Tienes preguntas sobre tu cotización?</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Nuestro equipo está disponible para ayudarte</div>
          <a href="mailto:ing@alebas.co" style={{ display: 'inline-block', padding: '8px 20px', background: C.teal, color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none', marginRight: 8 }}>
            📧 ing@alebas.co
          </a>
          <a href="https://solar-hub.co" style={{ display: 'inline-block', padding: '8px 20px', background: 'transparent', color: C.teal, borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none', border: `1px solid ${C.teal}66` }}>
            🌐 solar-hub.co
          </a>
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 10, color: C.muted, lineHeight: 1.8 }}>
          <div>Cotización #{quote.id}</div>
          <div style={{ color: C.teal }}>ALEBAS Ingeniería SAS · NIT 901.992.450-5 · Ley 1715 · RETIE · CREG 174/2021</div>
        </div>
      </div>
    </div>
  );
}
