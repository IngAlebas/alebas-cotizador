import React, { useState } from 'react';
import { C, fmtCOP, DEPTS } from '../constants';

const I0 = { name: '', company: '', dept: 'Meta', phone: '', email: '', retie: '', years: '', types: [], maxKwp: '' };

export default function InstallerReg({ addInstaller }) {
  const [f, setF] = useState(I0);
  const [done, setDone] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleType = t => setF(p => ({ ...p, types: p.types.includes(t) ? p.types.filter(x => x !== t) : [...p.types, t] }));

  const submit = () => {
    if (!f.name || !f.phone || !f.email || !f.retie) return;
    addInstaller({ ...f, id: Date.now(), date: new Date().toLocaleDateString('es-CO'), status: 'pendiente' });
    setDone(true);
  };

  const ss = {
    wrap: { maxWidth: 680, margin: '0 auto', padding: '20px 14px' },
    card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 22px', marginBottom: 12 },
    lbl: { display: 'block', fontSize: 10, color: C.muted, marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
    inp: { width: '100%', background: C.dark, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 11px', color: C.text, fontSize: 13, boxSizing: 'border-box' },
    btn: { padding: '10px 24px', background: C.teal, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  };

  if (done) return (
    <div style={ss.wrap}>
      <div style={{ ...ss.card, textAlign: 'center', padding: '52px 22px' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${C.teal}22`, border: `2px solid ${C.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 14px', color: C.teal }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>¡Solicitud recibida!</div>
        <div style={{ color: C.muted, fontSize: 13, maxWidth: 360, margin: '0 auto 18px', lineHeight: 1.7 }}>
          Gracias <strong style={{ color: '#fff' }}>{f.name}</strong>. Revisaremos tu información y te contactaremos en máximo 72 horas para completar el proceso de vinculación.
        </div>
        <button style={ss.btn} onClick={() => { setDone(false); setF(I0); }}>Nuevo registro</button>
      </div>
    </div>
  );

  return (
    <div style={ss.wrap}>
      <div style={{ ...ss.card, borderColor: C.teal }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 32 }}>🔧</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Red de instaladores SolarHub</div>
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
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 14 }}>Formulario de registro</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 11 }}>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Nombre completo *</label><input style={ss.inp} value={f.name} onChange={e => u('name', e.target.value)} placeholder="Tu nombre" /></div>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Empresa (si aplica)</label><input style={ss.inp} value={f.company} onChange={e => u('company', e.target.value)} placeholder="Empresa o independiente" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 11 }}>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Teléfono / WhatsApp *</label><input style={ss.inp} value={f.phone} onChange={e => u('phone', e.target.value)} placeholder="300 000 0000" /></div>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Email *</label><input style={ss.inp} value={f.email} onChange={e => u('email', e.target.value)} placeholder="tu@email.com" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 11 }}>
          <div style={{ flex: 1 }}>
            <label style={ss.lbl}>Departamento principal *</label>
            <select style={{ ...ss.inp, cursor: 'pointer' }} value={f.dept} onChange={e => u('dept', e.target.value)}>
              {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={ss.lbl}>Certificación RETIE *</label>
            <input style={ss.inp} value={f.retie} onChange={e => u('retie', e.target.value)} placeholder="Número de certificado" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={ss.lbl}>Años de experiencia</label>
            <select style={{ ...ss.inp, cursor: 'pointer' }} value={f.years} onChange={e => u('years', e.target.value)}>
              {['', '1-2', '3-5', '6-10', 'Más de 10'].map(o => <option key={o} value={o}>{o || 'Seleccionar'}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={ss.lbl}>Capacidad máxima (kWp/mes)</label>
            <input type="number" style={ss.inp} value={f.maxKwp} onChange={e => u('maxKwp', e.target.value)} placeholder="Ej: 50" />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={ss.lbl}>Tipos de proyectos</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['Residencial', 'Comercial', 'Industrial', 'Agroindustrial', 'Rural / Off-grid'].map(t => (
              <div key={t} onClick={() => toggleType(t)} style={{ padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 11, border: `1.5px solid ${f.types.includes(t) ? C.teal : C.border}`, background: f.types.includes(t) ? `${C.teal}20` : 'transparent', color: f.types.includes(t) ? C.teal : C.muted, fontWeight: f.types.includes(t) ? 600 : 400 }}>{t}</div>
            ))}
          </div>
        </div>
        <div style={{ background: `${C.teal}10`, borderRadius: 6, padding: '9px 12px', marginBottom: 14, fontSize: 10, color: C.muted }}>
          Al registrarte aceptas los términos de la red ALEBAS. Tu información será validada antes de asignarte proyectos.
        </div>
        <button style={{ ...ss.btn, width: '100%', padding: '12px', opacity: (!f.name || !f.phone || !f.email || !f.retie) ? 0.4 : 1 }} onClick={submit}>
          Enviar solicitud de vinculación →
        </button>
      </div>
    </div>
  );
}
