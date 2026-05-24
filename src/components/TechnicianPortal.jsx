import React, { useState, useEffect } from 'react';
import { C } from '../constants';

const DOC_STATUS_LABELS = {
  pendiente: { label: 'Pendiente de revisión', color: C.muted },
  en_revision: { label: 'En revisión técnica', color: C.yellow },
  aprobado: { label: 'Documentos aprobados', color: C.teal },
  cambios_solicitados: { label: 'Cambios solicitados', color: C.orange || '#FF8C00' },
};

function MetricChip({ label, value }) {
  return (
    <div style={{
      background: `${C.teal}12`,
      border: `1px solid ${C.teal}22`,
      borderRadius: 7,
      padding: '8px 12px',
    }}>
      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{value || '—'}</div>
    </div>
  );
}

export default function TechnicianPortal({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quote, setQuote] = useState(null);
  const [UnifilarComp, setUnifilarComp] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  // Load quote data on mount
  useEffect(() => {
    if (!token) {
      setError('Token no proporcionado.');
      setLoading(false);
      return;
    }
    const base = process.env.REACT_APP_N8N_BASE_URL;
    if (!base) {
      setError('Configuración del servidor no disponible.');
      setLoading(false);
      return;
    }
    fetch(`${base}/tech-review?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok || !data.quote) {
          setError('Token inválido o expirado. Contactar a ALEBAS.');
        } else {
          setQuote(data.quote);
          setNotes(data.quote.tech_notes || '');
        }
      })
      .catch(() => setError('Error de red. Verifique su conexión e intente de nuevo.'))
      .finally(() => setLoading(false));
  }, [token]);

  // Attempt to lazy-load UnifileGenerator (may not exist yet)
  useEffect(() => {
    import('./UnifileGenerator')
      .then(m => setUnifilarComp(() => m.default))
      .catch(() => {});
  }, []);

  const handleSubmit = async (action) => {
    if (!notes.trim()) {
      alert('Por favor ingrese notas técnicas antes de enviar.');
      return;
    }
    setSubmitting(true);
    try {
      const base = process.env.REACT_APP_N8N_BASE_URL;
      const res = await fetch(`${base}/tech-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, notes }),
      });
      const data = await res.json();
      if (data.ok) {
        setSubmitResult({ action, docStatus: data.docStatus });
        setSubmitted(true);
        // Update local quote state
        setQuote(prev => ({
          ...prev,
          doc_status: data.docStatus,
          tech_notes: notes,
          tech_approved_at: action === 'approve' ? new Date().toISOString() : null,
        }));
      } else {
        alert('Error al enviar revisión. Intente de nuevo.');
      }
    } catch {
      alert('Error de red. Intente de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.teal}33`, borderTop: `3px solid ${C.teal}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ color: C.muted, fontSize: 13 }}>Cargando documentos...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: C.card, border: `1px solid ${C.teal}33`, borderRadius: 12, padding: '36px 32px', maxWidth: 440, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Acceso no válido</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{error}</div>
          <div style={{ marginTop: 20, fontSize: 11, color: C.teal }}>ing@alebas.co · +57 (310) ALEBAS</div>
        </div>
      </div>
    );
  }

  const p = quote.payload || {};
  const docMeta = DOC_STATUS_LABELS[quote.doc_status] || DOC_STATUS_LABELS.pendiente;
  const isApproved = quote.doc_status === 'aprobado';

  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: 'Outfit, sans-serif' }}>
      {/* ── Header ── */}
      <div style={{
        background: C.card,
        padding: '16px 24px',
        borderBottom: `1px solid ${C.teal}33`,
        display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 50,
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.yellow }}>⚡ ALEBAS</div>
        <div style={{ color: C.muted, fontSize: 13 }}>Portal Técnico · Revisión de Documentos</div>
        {quote.tech_name && (
          <div style={{ marginLeft: 'auto', fontSize: 12, color: C.teal, background: `${C.teal}12`, padding: '4px 10px', borderRadius: 20, border: `1px solid ${C.teal}33` }}>
            Técnico: {quote.tech_name}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* ── Status badge ── */}
        <div style={{ marginBottom: 20 }}>
          <span style={{
            display: 'inline-block',
            padding: '5px 14px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            background: `${docMeta.color}18`,
            color: docMeta.color,
            border: `1px solid ${docMeta.color}44`,
          }}>
            {quote.doc_status === 'aprobado' ? '✓ ' : quote.doc_status === 'en_revision' ? '🔄 ' : quote.doc_status === 'cambios_solicitados' ? '↩ ' : ''}
            {docMeta.label}
          </span>
        </div>

        {/* ── System summary card ── */}
        <div style={{ background: C.card, border: `1px solid ${C.teal}22`, borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
            {p.name || 'Cliente'}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>
            {p.address || p.city || '—'}{p.operator ? ` · ${p.operator}` : ''}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            <MetricChip label="Tipo de sistema" value={p.systemType} />
            <MetricChip label="Capacidad" value={p.results?.actKwp ? `${p.results.actKwp} kWp` : null} />
            <MetricChip label="Paneles" value={p.results?.numPanels} />
            <MetricChip
              label="Panel"
              value={p.panel ? `${p.panel.brand || ''} ${p.panel.model || ''}`.trim() || null : null}
            />
            <MetricChip
              label="Inversor"
              value={p.inverter ? `${p.inverter.brand || ''} ${p.inverter.model || ''}`.trim() || null : null}
            />
            <MetricChip label="Consumo mensual" value={p.monthlyKwh ? `${p.monthlyKwh} kWh/mes` : null} />
            <MetricChip label="Producción estimada" value={p.results?.mp ? `${Math.round(p.results.mp)} kWh/mes` : null} />
            <MetricChip label="Cobertura" value={p.results?.cov ? `${p.results.cov}%` : null} />
          </div>
        </div>

        {/* ── Document preview section ── */}
        <div style={{ background: C.card, border: `1px solid ${C.teal}22`, borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Diagrama Unifilar / Documentación Técnica</div>

          {UnifilarComp ? (
            <UnifilarComp mode="technical" payload={p} />
          ) : (
            <div style={{
              background: `${C.yellow}12`,
              border: `1px solid ${C.yellow}33`,
              borderRadius: 8,
              padding: '16px 20px',
              display: 'flex', alignItems: 'flex-start', gap: 12,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>⚠</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.yellow, marginBottom: 4 }}>
                  Revisar planos en el PDF adjunto al email
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                  El visor de diagramas unilar no está disponible en esta versión.
                  Los documentos técnicos completos (diagrama unifilar, memoria de cálculo, layout de paneles)
                  fueron enviados al correo del técnico asignado como archivos PDF adjuntos.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Review form ── */}
        <div style={{ background: C.card, border: `1px solid ${C.teal}22`, borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Revisión Técnica</div>

          {isApproved && !submitted ? (
            <div style={{
              background: `${C.teal}12`,
              border: `1px solid ${C.teal}33`,
              borderRadius: 8,
              padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 18, color: C.teal }}>✓</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.teal }}>Documentos aprobados</div>
                {quote.tech_approved_at && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {new Date(quote.tech_approved_at).toLocaleString('es-CO', {
                      year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : submitted ? (
            <div style={{
              background: submitResult?.action === 'approve' ? `${C.teal}12` : `${C.orange || '#FF8C00'}12`,
              border: `1px solid ${submitResult?.action === 'approve' ? C.teal : C.orange || '#FF8C00'}33`,
              borderRadius: 8,
              padding: '14px 18px',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: submitResult?.action === 'approve' ? C.teal : C.orange || '#FF8C00', marginBottom: 4 }}>
                {submitResult?.action === 'approve' ? '✓ Documentos aprobados exitosamente' : '↩ Cambios solicitados al equipo de diseño'}
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                ALEBAS ha sido notificado. El equipo de ingeniería procesará su revisión a la brevedad.
              </div>
            </div>
          ) : (
            <>
              {/* Existing notes from previous review */}
              {quote.tech_notes && quote.doc_status !== 'pendiente' && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: `${C.teal}08`, border: `1px solid ${C.teal}22`, borderRadius: 7 }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Notas previas</div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{quote.tech_notes}</div>
                </div>
              )}

              {/* Notes textarea */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  Notas técnicas *
                </label>
                <textarea
                  rows={5}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Observaciones, correcciones o aprobación del diseño..."
                  style={{
                    width: '100%',
                    background: C.dark,
                    border: `1px solid ${C.teal}44`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: C.text,
                    fontSize: 13,
                    lineHeight: 1.5,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    fontFamily: 'Outfit, sans-serif',
                  }}
                />
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleSubmit('approve')}
                  disabled={submitting || !notes.trim()}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: '11px 20px',
                    background: !notes.trim() || submitting ? '#1a3040' : C.teal,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: !notes.trim() || submitting ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {submitting ? 'Enviando...' : '✓ Aprobar documentos'}
                </button>
                <button
                  onClick={() => handleSubmit('request_changes')}
                  disabled={submitting || !notes.trim()}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: '11px 20px',
                    background: 'transparent',
                    color: !notes.trim() || submitting ? C.muted : (C.orange || '#FF8C00'),
                    border: `1px solid ${!notes.trim() || submitting ? C.muted + '44' : (C.orange || '#FF8C00') + '66'}`,
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: !notes.trim() || submitting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  ↩ Solicitar cambios
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 10, color: C.muted }}>
                * Las notas son obligatorias en ambos casos y quedarán registradas en el expediente de la cotización.
              </div>
            </>
          )}
        </div>

        {/* Footer info */}
        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 10, color: C.muted, lineHeight: 1.8 }}>
          <div>Cotización #{quote.id} · {quote.status}</div>
          <div style={{ color: C.teal }}>ALEBAS Ingeniería SAS · NIT 901.992.450-5 · Ley 1715 · RETIE</div>
        </div>
      </div>
    </div>
  );
}
