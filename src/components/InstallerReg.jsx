import React, { useState } from 'react';
import { C, DEPTS } from '../constants';
import { validateContactForm } from '../services/validation';

const I0 = {
  name: '', company: '', dept: 'Meta', phone: '', email: '',
  retie: '', years: '', types: [], maxKwp: '',
  installerType: 'tecnico', copniaNumber: '', conteNumber: '',
};

export default function InstallerReg({ addInstaller }) {
  const [form, setForm] = useState(I0);
  const [done, setDone] = useState(false);
  const [docs, setDocs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const u = (k, v) => { setForm(p => ({ ...p, [k]: v })); setFormErrors(e => ({ ...e, [k]: undefined })); };
  const toggleType = t => setForm(p => ({
    ...p, types: p.types.includes(t) ? p.types.filter(x => x !== t) : [...p.types, t]
  }));

  const submit = async () => {
    const { valid, errors } = validateContactForm({ name: form.name, email: form.email, phone: form.phone });
    if (!valid) { setFormErrors(errors); return; }
    if (!form.retie) { setFormErrors(e => ({ ...e, retie: 'Certificación RETIE requerida' })); return; }
    setSubmitting(true);
    try {
      const installer = {
        ...form, id: Date.now(),
        date: new Date().toLocaleDateString('es-CO'),
        status: 'pendiente',
      };
      addInstaller(installer);

      // Submit credential documents if any
      if (docs.length > 0) {
        const base = process.env.REACT_APP_N8N_BASE_URL;
        try {
          await fetch(`${base}/installer-credentials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'SUBMIT',
              technician_id: null, // backend matches by email
              name: form.name,
              email: form.email,
              phone: form.phone,
              installer_type: form.installerType || 'tecnico',
              copnia_number: form.copniaNumber || null,
              conte_number: form.conteNumber || null,
              documents: docs,
            }),
          });
        } catch (_) {
          // credential submission is best-effort; installer is already registered
        }
      }

      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  const ss = {
    wrap: { maxWidth: 680, margin: '0 auto', padding: '20px 14px' },
    card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 22px', marginBottom: 12 },
    lbl: { display: 'block', fontSize: 10, color: C.muted, marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
    inp: { width: '100%', background: C.dark, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 11px', color: C.text, fontSize: 13, boxSizing: 'border-box', fontFamily: 'Outfit' },
    btn: { padding: '10px 24px', background: C.teal, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'Outfit' },
  };

  if (done) return (
    <div style={ss.wrap}>
      <div style={{ ...ss.card, textAlign: 'center', padding: '52px 22px' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${C.teal}22`, border: `2px solid ${C.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 14px', color: C.teal }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>¡Solicitud recibida!</div>
        <div style={{ color: C.muted, fontSize: 13, maxWidth: 380, margin: '0 auto 10px', lineHeight: 1.7 }}>
          Gracias <strong style={{ color: '#fff' }}>{form.name}</strong>. Revisaremos tu información y tus documentos en 2–3 días hábiles.
        </div>
        <div style={{ fontSize: 12, color: C.amber, marginBottom: 20 }}>
          Recibirás una notificación cuando tus credenciales sean verificadas.
        </div>
        <button style={ss.btn} onClick={() => { setDone(false); setForm(I0); setDocs([]); }}>Nuevo registro</button>
      </div>
    </div>
  );

  const requiredDocs = form.installerType === 'ingeniero'
    ? [
        { key: 'diploma', label: 'Diploma universitario', required: true },
        { key: 'hoja_de_vida', label: 'Hoja de vida', required: true },
        { key: 'tarjeta_profesional', label: 'Tarjeta profesional COPNIA', required: true },
      ]
    : [
        { key: 'certificado_conte', label: 'Certificado CONTE vigente', required: true },
        { key: 'hoja_de_vida', label: 'Hoja de vida', required: true },
      ];

  return (
    <div style={ss.wrap}>
      {/* RETIE verification warning */}
      <div style={{
        background: `${C.amber}12`, border: `1px solid ${C.amber}30`, borderRadius: 10,
        padding: '12px 16px', marginBottom: 14, fontSize: 13, color: C.amber,
      }}>
        ⚠️ <strong>Verificación RETIE requerida:</strong> Para activar tu cuenta necesitamos verificar tus credenciales.
        La revisión toma 2–3 días hábiles.
      </div>

      <div style={{ ...ss.card, borderColor: C.teal }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 32 }}>🔧</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Red de instaladores ALEBAS</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Conectamos proyectos con técnicos certificados en todo Colombia</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
        {[['🌍', 'Cobertura nacional', 'Proyectos en todas las regiones'], ['💰', 'Ingresos adicionales', 'Comisiones por proyecto cerrado'], ['📋', 'Proyectos calificados', 'Solo solicitudes de tu región']].map(([ic, t, d]) => (
          <div key={t} style={{ ...ss.card, flex: 1, textAlign: 'center', padding: '14px 10px' }}>
            <div style={{ fontSize: 20, marginBottom: 5 }}>{ic}</div>
            <div style={{ fontWeight: 600, color: C.teal, fontSize: 11, marginBottom: 3 }}>{t}</div>
            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{d}</div>
          </div>
        ))}
      </div>

      <div style={ss.card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Formulario de registro</div>

        {/* Installer type selector — top of form */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Tipo de instalador *</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { val: 'tecnico', label: '⚡ Técnico Electricista', sub: 'Certificado CONTE' },
              { val: 'ingeniero', label: '🎓 Ingeniero', sub: 'Tarjeta profesional COPNIA' }
            ].map(opt => (
              <button key={opt.val} type="button"
                onClick={() => setForm(f => ({ ...f, installerType: opt.val }))}
                style={{
                  flex: 1, padding: '12px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${form.installerType === opt.val ? C.teal : C.border}`,
                  background: form.installerType === opt.val ? `${C.teal}18` : C.dark,
                  color: form.installerType === opt.val ? C.text : C.muted,
                  fontFamily: 'Outfit', transition: 'all 0.2s',
                }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</div>
                <div style={{ fontSize: 11, marginTop: 3, color: C.muted }}>{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Name + company */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 11 }}>
          <div style={{ flex: 1 }}>
            <label style={ss.lbl}>Nombre completo *</label>
            <input style={{ ...ss.inp, borderColor: formErrors.name ? C.red : undefined }} value={form.name} onChange={e => u('name', e.target.value)} placeholder="Tu nombre" />
            {formErrors.name && <span style={{ color: C.red, fontSize: 12, marginTop: 3, display: 'block' }}>{formErrors.name}</span>}
          </div>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Empresa (si aplica)</label><input style={ss.inp} value={form.company} onChange={e => u('company', e.target.value)} placeholder="Empresa o independiente" /></div>
        </div>

        {/* Phone + email */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 11 }}>
          <div style={{ flex: 1 }}>
            <label style={ss.lbl}>Teléfono / WhatsApp *</label>
            <input style={{ ...ss.inp, borderColor: formErrors.phone ? C.red : undefined }} value={form.phone} onChange={e => u('phone', e.target.value)} placeholder="300 000 0000" />
            {formErrors.phone && <span style={{ color: C.red, fontSize: 12, marginTop: 3, display: 'block' }}>{formErrors.phone}</span>}
          </div>
          <div style={{ flex: 1 }}>
            <label style={ss.lbl}>Email *</label>
            <input style={{ ...ss.inp, borderColor: formErrors.email ? C.red : undefined }} value={form.email} onChange={e => u('email', e.target.value)} placeholder="tu@email.com" />
            {formErrors.email && <span style={{ color: C.red, fontSize: 12, marginTop: 3, display: 'block' }}>{formErrors.email}</span>}
          </div>
        </div>

        {/* Dept + RETIE */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 11 }}>
          <div style={{ flex: 1 }}>
            <label style={ss.lbl}>Departamento principal *</label>
            <select style={{ ...ss.inp, cursor: 'pointer' }} value={form.dept} onChange={e => u('dept', e.target.value)}>
              {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={ss.lbl}>Certificación RETIE *</label>
            <input style={{ ...ss.inp, borderColor: formErrors.retie ? C.red : undefined }} value={form.retie} onChange={e => u('retie', e.target.value)} placeholder="Número de certificado" />
            {formErrors.retie && <span style={{ color: C.red, fontSize: 12, marginTop: 3, display: 'block' }}>{formErrors.retie}</span>}
          </div>
        </div>

        {/* Conditional credential number field */}
        {form.installerType === 'ingeniero' ? (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: C.muted }}>N° Tarjeta Profesional COPNIA *</label>
            <input value={form.copniaNumber || ''} onChange={e => setForm(f => ({ ...f, copniaNumber: e.target.value }))}
              placeholder="ej: 12345678901CP"
              style={{ width: '100%', background: C.dark, border: `1px solid ${C.border}`, borderRadius: 10,
                color: C.text, padding: '10px 12px', fontSize: 14, fontFamily: 'Outfit', boxSizing: 'border-box', marginTop: 4 }} />
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: C.muted }}>N° Certificado CONTE *</label>
            <input value={form.conteNumber || ''} onChange={e => setForm(f => ({ ...f, conteNumber: e.target.value }))}
              placeholder="ej: CONTE-2024-XXXXXX"
              style={{ width: '100%', background: C.dark, border: `1px solid ${C.border}`, borderRadius: 10,
                color: C.text, padding: '10px 12px', fontSize: 14, fontFamily: 'Outfit', boxSizing: 'border-box', marginTop: 4 }} />
          </div>
        )}

        {/* Experience + capacity */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={ss.lbl}>Años de experiencia</label>
            <select style={{ ...ss.inp, cursor: 'pointer' }} value={form.years} onChange={e => u('years', e.target.value)}>
              {['', '1-2', '3-5', '6-10', 'Más de 10'].map(o => <option key={o} value={o}>{o || 'Seleccionar'}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={ss.lbl}>Capacidad máxima (kWp/mes)</label>
            <input type="number" style={ss.inp} value={form.maxKwp} onChange={e => u('maxKwp', e.target.value)} placeholder="Ej: 50" />
          </div>
        </div>

        {/* Project types */}
        <div style={{ marginBottom: 14 }}>
          <label style={ss.lbl}>Tipos de proyectos</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['Residencial', 'Comercial', 'Industrial', 'Agroindustrial', 'Rural / Off-grid'].map(t => (
              <div key={t} onClick={() => toggleType(t)} style={{ padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 11, border: `1.5px solid ${form.types.includes(t) ? C.teal : C.border}`, background: form.types.includes(t) ? `${C.teal}20` : 'transparent', color: form.types.includes(t) ? C.teal : C.muted, fontWeight: form.types.includes(t) ? 600 : 400 }}>{t}</div>
            ))}
          </div>
        </div>

        {/* Document upload section */}
        <div style={{ marginBottom: 20, background: C.card, borderRadius: 14, padding: 18, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>
            📎 Documentos requeridos (RETIE 2013)
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
            {form.installerType === 'ingeniero'
              ? 'Diploma universitario · Hoja de vida · Tarjeta profesional COPNIA'
              : 'Certificado CONTE vigente · Hoja de vida'}
          </div>

          {requiredDocs.map(docDef => {
            const uploaded = docs.find(d => d.doc_type === docDef.key);
            return (
              <div key={docDef.key} style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                background: C.dark, borderRadius: 8, padding: '10px 12px',
              }}>
                <span style={{ fontSize: 18 }}>{uploaded ? '✅' : '📄'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: uploaded ? C.green : C.text }}>{docDef.label}</div>
                  {uploaded && <div style={{ fontSize: 11, color: C.muted }}>{uploaded.file_name}</div>}
                </div>
                <label style={{
                  cursor: 'pointer', background: C.teal, color: '#fff', borderRadius: 8,
                  padding: '6px 12px', fontSize: 12, fontFamily: 'Outfit', fontWeight: 600,
                }}>
                  {uploaded ? 'Cambiar' : 'Subir'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) { alert('Archivo máximo 5 MB'); return; }
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const b64 = ev.target.result.split(',')[1];
                        setDocs(prev => [
                          ...prev.filter(d => d.doc_type !== docDef.key),
                          { doc_type: docDef.key, file_name: file.name, file_size_kb: Math.round(file.size / 1024), file_data_b64: b64 },
                        ]);
                      };
                      reader.readAsDataURL(file);
                    }} />
                </label>
              </div>
            );
          })}

          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
            Formatos: PDF, JPG, PNG · Máximo 5 MB por archivo · Tu información está protegida (Ley 1581/2012)
          </div>
        </div>

        <div style={{ background: `${C.teal}10`, borderRadius: 6, padding: '9px 12px', marginBottom: 14, fontSize: 10, color: C.muted }}>
          Al registrarte aceptas los términos de la red ALEBAS. Tu información será validada antes de asignarte proyectos.
        </div>
        <button
          style={{ ...ss.btn, width: '100%', padding: '12px', opacity: submitting ? 0.4 : 1 }}
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? 'Enviando...' : 'Enviar solicitud de vinculación →'}
        </button>
      </div>
    </div>
  );
}
