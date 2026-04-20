import React, { useState } from 'react';
import { C } from '../constants';

// Portal público donde los proveedores suben su lista de precios en PDF.
// El archivo se guarda como data URL en localStorage para que el admin lo
// descargue desde el BackOffice y actualice el catálogo manualmente.
// Evita exponer una API de upload real sin auth: todo queda del lado cliente
// hasta que el admin lo procese.

const S0 = { company: '', contact: '', email: '', phone: '', category: 'Paneles', fileName: '', fileData: '', notes: '' };
const CATS = ['Paneles', 'Inversores', 'Baterías', 'Estructuras', 'Protecciones', 'Cables', 'Otros'];
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB — suficiente para una lista de precios

export default function SupplierPortal({ addSupplierSubmission }) {
  const [f, setF] = useState(S0);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));

  const onFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    if (file.type !== 'application/pdf') { setErr('Solo se aceptan archivos PDF'); return; }
    if (file.size > MAX_BYTES) { setErr('El PDF supera 4 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setF(p => ({ ...p, fileName: file.name, fileData: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!f.company || !f.contact || !f.email || !f.fileData) return;
    addSupplierSubmission({
      ...f,
      id: Date.now(),
      date: new Date().toLocaleDateString('es-CO'),
      dateISO: new Date().toISOString(),
      status: 'pendiente',
    });
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
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>¡Lista de precios enviada!</div>
        <div style={{ color: C.muted, fontSize: 13, maxWidth: 380, margin: '0 auto 18px', lineHeight: 1.7 }}>
          Gracias <strong style={{ color: '#fff' }}>{f.company}</strong>. Revisaremos tu lista y actualizaremos el catálogo en las próximas 48 horas. Si hay dudas, te contactaremos al correo registrado.
        </div>
        <button style={ss.btn} onClick={() => { setDone(false); setF(S0); }}>Enviar otra lista</button>
      </div>
    </div>
  );

  return (
    <div style={ss.wrap}>
      <div style={{ ...ss.card, borderColor: C.teal }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 32 }}>📄</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Portal de proveedores</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Sube tu lista de precios en PDF y la integramos al cotizador</div>
          </div>
        </div>
      </div>
      <div style={ss.card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 14 }}>Datos del proveedor</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 11 }}>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Empresa *</label><input style={ss.inp} value={f.company} onChange={e => u('company', e.target.value)} placeholder="Razón social" /></div>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Contacto *</label><input style={ss.inp} value={f.contact} onChange={e => u('contact', e.target.value)} placeholder="Nombre del vendedor" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 11 }}>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Email *</label><input style={ss.inp} value={f.email} onChange={e => u('email', e.target.value)} placeholder="ventas@proveedor.com" /></div>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Teléfono</label><input style={ss.inp} value={f.phone} onChange={e => u('phone', e.target.value)} placeholder="300 000 0000" /></div>
        </div>
        <div style={{ marginBottom: 11 }}>
          <label style={ss.lbl}>Categoría principal</label>
          <select style={{ ...ss.inp, cursor: 'pointer' }} value={f.category} onChange={e => u('category', e.target.value)}>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 11 }}>
          <label style={ss.lbl}>Lista de precios en PDF * (máx. 4 MB)</label>
          <input type="file" accept="application/pdf" onChange={onFile}
            style={{ ...ss.inp, padding: '7px 10px', cursor: 'pointer' }} />
          {f.fileName && (
            <div style={{ fontSize: 11, color: C.teal, marginTop: 5 }}>✓ {f.fileName}</div>
          )}
          {err && <div style={{ fontSize: 11, color: '#ff6b6b', marginTop: 5 }}>{err}</div>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={ss.lbl}>Notas (opcional)</label>
          <textarea style={{ ...ss.inp, minHeight: 60, fontFamily: 'inherit' }} value={f.notes}
            onChange={e => u('notes', e.target.value)} placeholder="Vigencia, condiciones, stock disponible, etc." />
        </div>
        <div style={{ background: `${C.teal}10`, borderRadius: 6, padding: '9px 12px', marginBottom: 14, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
          Al enviar, aceptas que ALEBAS use esta información para evaluar inclusión de tus productos en el cotizador. No compartimos listas con terceros.
        </div>
        <button
          style={{ ...ss.btn, width: '100%', padding: '12px', opacity: (!f.company || !f.contact || !f.email || !f.fileData) ? 0.4 : 1 }}
          onClick={submit}
        >Enviar lista de precios →</button>
      </div>
    </div>
  );
}
