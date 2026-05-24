import React, { useState, useEffect, useCallback } from 'react';
import { C } from '../constants';
import {
  getSession, saveSession, clearSession,
  supplierAuth, getStock, createStockItem, updateStockItem,
  getOrders, updateOrderStatus, getAnalytics, updateProfile,
  PLATFORM_FEE_EQUIPMENT_PCT,
} from '../services/supplier';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtCOP = n => n != null ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
const fmt    = n => n != null ? Math.round(n).toLocaleString('es-CO') : '—';

// ── Order status map ──────────────────────────────────────────────────────────
const PO_STATUS = {
  pendiente:  { label: 'Pendiente',  color: C.yellow  },
  confirmado: { label: 'Confirmado', color: C.teal    },
  preparando: { label: 'Preparando', color: C.amber   },
  enviado:    { label: 'Enviado',    color: '#3b82f6' },
  entregado:  { label: 'Entregado',  color: C.green   },
  instalado:  { label: 'Instalado',  color: '#22c55e' },
  completado: { label: 'Completado', color: '#16a34a' },
  cancelado:  { label: 'Cancelado',  color: C.red     },
};

const PO_TIMELINE = ['pendiente','confirmado','preparando','enviado','entregado','instalado','completado'];

// ── Equipment types ───────────────────────────────────────────────────────────
const EQUIP_TYPES = {
  panel:      'Panel FV',
  inverter:   'Inversor',
  battery:    'Batería',
  structure:  'Estructura',
  protection: 'Protección',
  cable:      'Cable',
  other:      'Otro',
};

// ── Shared style atoms ────────────────────────────────────────────────────────
const inp = {
  background: C.dark,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: '8px 11px',
  color: C.text,
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  width: '100%',
};
const lbl = {
  display: 'block',
  fontSize: 10,
  color: C.muted,
  marginBottom: 3,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};
const card = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '18px 20px',
  marginBottom: 12,
};
const btnPrimary = {
  padding: '9px 18px',
  background: C.teal,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'inherit',
};
const btnSmall = (bg = C.teal) => ({
  padding: '5px 12px',
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'inherit',
});
const pill = color => ({
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 99,
  background: `${color}22`,
  color,
  border: `1px solid ${color}44`,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: 'nowrap',
});

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ size = 16, color = C.teal }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      border: `2px solid ${color}44`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'sp-spin 0.8s linear infinite',
      flexShrink: 0,
    }} />
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, color = '#fff', sub }) {
  return (
    <div style={{
      background: C.card2 || '#111f35',
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: '14px 16px',
      flex: '1 1 130px',
      minWidth: 120,
    }}>
      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabBtn({ id, icon, label, active, onClick }) {
  return (
    <button onClick={() => onClick(id)} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      padding: '10px 4px 8px',
      flex: 1,
      border: 'none',
      borderBottom: active ? `2px solid ${C.yellow}` : '2px solid transparent',
      background: 'transparent',
      color: active ? C.yellow : C.muted,
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 9,
      fontWeight: active ? 700 : 400,
      transition: 'all .15s',
      minWidth: 0,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 56 }}>{label}</span>
    </button>
  );
}

// ── Filter chips ──────────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 12px',
      borderRadius: 99,
      border: `1px solid ${active ? C.teal : C.border}`,
      background: active ? `${C.teal}22` : 'transparent',
      color: active ? C.teal : C.muted,
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 11,
      fontWeight: active ? 700 : 400,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onSuccess, initError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(initError || '');

  const handleLogin = async () => {
    if (!email || !password) { setErr('Ingrese correo y contraseña.'); return; }
    setLoading(true); setErr('');
    try {
      const data = await supplierAuth({ email, password });
      if (data.ok) onSuccess(data.jwt, data.supplier);
      else setErr(data.message || 'Credenciales inválidas.');
    } catch (e) {
      setErr('Error de conexión. Verifique su red e intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <style>{`@keyframes sp-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ ...card, maxWidth: 400, width: '100%', textAlign: 'center', padding: '40px 32px' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${C.teal}18`, border: `2px solid ${C.teal}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 22 }}>📦</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Portal de Proveedores</div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 28 }}>SolarHub · ALEBAS Ingeniería SAS</div>

        <div style={{ marginBottom: 12, textAlign: 'left' }}>
          <label style={lbl}>Correo electrónico</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="ventas@empresa.com" style={inp} autoFocus />
        </div>
        <div style={{ marginBottom: 18, textAlign: 'left', position: 'relative' }}>
          <label style={lbl}>Contraseña</label>
          <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="••••••••" style={{ ...inp, paddingRight: 40 }} />
          <button onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 10, bottom: 9, background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 14 }}>
            {show ? '🙈' : '👁'}
          </button>
        </div>

        {err && (
          <div style={{ background: '#f8717115', border: '1px solid #f8717133', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#f87171', textAlign: 'left' }}>
            {err}
          </div>
        )}

        <button onClick={handleLogin} disabled={loading} style={{ ...btnPrimary, width: '100%', padding: '12px', opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loading ? <><Spinner size={14} color="#fff" /> Verificando…</> : 'Ingresar →'}
        </button>

        <div style={{ marginTop: 20, fontSize: 10, color: '#2a4050' }}>
          ¿No tienes acceso? Contacta a ALEBAS en <span style={{ color: C.teal }}>ing@alebas.co</span>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═════════════════════════════════════════════════════════════════════════════
function TabDashboard({ analytics, orders, stock, onRefresh, refreshing }) {
  const criticalStock = (stock || []).filter(it => it.qty_available < 5).slice(0, 5);
  const recentOrders  = (orders || []).slice(0, 5);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Resumen</div>
        <button onClick={onRefresh} disabled={refreshing} style={{ ...btnSmall(C.card2 || '#111f35'), border: `1px solid ${C.border}`, color: C.teal, display: 'flex', alignItems: 'center', gap: 6 }}>
          {refreshing ? <Spinner size={12} /> : '↻'} Actualizar
        </button>
      </div>

      {/* Metric cards 2×2 grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <MetricCard label="Pendientes"          value={analytics?.pendingOrders ?? '—'}     color={C.yellow} />
        <MetricCard label="En proceso"          value={analytics?.activeOrders ?? '—'}       color={C.teal}   />
        <MetricCard label="Completados/mes"     value={analytics?.completedThisMonth ?? '—'} color={C.green}  />
        <MetricCard label="Ingresos netos/mes"  value={fmtCOP(analytics?.netRevenueThisMonth)} color="#fff"  />
      </div>

      {/* Critical stock */}
      {criticalStock.length > 0 && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 10 }}>⚠ Stock crítico (qty {'<'} 5)</div>
          {criticalStock.map(it => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 12, color: C.text }}>{it.brand} {it.model}</span>
              <span style={{ ...pill(C.red), fontSize: 10 }}>{it.qty_available} ud.</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Últimas órdenes</div>
          {recentOrders.map(po => {
            const st = PO_STATUS[po.status] || { label: po.status, color: C.muted };
            return (
              <div key={po.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{po.po_number}</span>
                  <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>{po.client?.city}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={pill(st.color)}>{st.label}</span>
                  <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{fmtCOP(po.supplier_net_cop)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {recentOrders.length === 0 && !analytics && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted, fontSize: 13 }}>
          No hay datos disponibles aún.<br />
          <button onClick={onRefresh} style={{ ...btnSmall(), marginTop: 10 }}>Cargar datos</button>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STOCK TAB
// ═════════════════════════════════════════════════════════════════════════════
function TabStock({ stock, setStock, supplier, jwt }) {
  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newItem, setNewItem] = useState({
    equipment_type: 'panel', brand: '', model: '',
    wp: '', kw: '', kwh: '', unit_price_cop: '', qty_available: '', lead_time_days: '3',
  });
  const [saving, setSaving] = useState(false);
  const [errNew, setErrNew] = useState('');

  const FILTER_OPTS = [
    ['all', 'Todos'],
    ['panel', 'Paneles'],
    ['inverter', 'Inversores'],
    ['battery', 'Baterías'],
    ['structure', 'Estructuras'],
    ['other', 'Otros'],
  ];

  const filtered = filter === 'all' ? stock : stock.filter(it => it.equipment_type === filter);

  const startEdit = it => {
    setEditingId(it.id);
    setEditQty(String(it.qty_available ?? ''));
    setEditPrice(String(it.unit_price_cop ?? ''));
  };

  const commitEdit = async (it) => {
    if (editingId !== it.id) return;
    const patch = {
      id: it.id,
      supplier_id: supplier.id,
      qty_available: Number(editQty),
      unit_price_cop: Number(editPrice),
    };
    try {
      await updateStockItem(patch, jwt);
      setStock(prev => prev.map(s => s.id === it.id ? { ...s, ...patch } : s));
    } catch {}
    setEditingId(null);
  };

  const deactivate = async (it) => {
    try {
      await updateStockItem({ id: it.id, supplier_id: supplier.id, is_active: false }, jwt);
      setStock(prev => prev.map(s => s.id === it.id ? { ...s, is_active: false } : s));
    } catch {}
  };

  const handleCreate = async () => {
    if (!newItem.brand || !newItem.model || !newItem.unit_price_cop || !newItem.qty_available) {
      setErrNew('Marca, modelo, precio y cantidad son obligatorios.'); return;
    }
    setSaving(true); setErrNew('');
    try {
      const payload = {
        supplier_id: supplier.id,
        equipment_type: newItem.equipment_type,
        brand: newItem.brand,
        model: newItem.model,
        wp: newItem.wp ? Number(newItem.wp) : null,
        kw: newItem.kw ? Number(newItem.kw) : null,
        kwh: newItem.kwh ? Number(newItem.kwh) : null,
        unit_price_cop: Number(newItem.unit_price_cop),
        qty_available: Number(newItem.qty_available),
        lead_time_days: Number(newItem.lead_time_days) || 3,
        is_active: true,
      };
      const res = await createStockItem(payload, jwt);
      if (res.ok && res.item) setStock(prev => [res.item, ...prev]);
      setShowNew(false);
      setNewItem({ equipment_type: 'panel', brand: '', model: '', wp: '', kw: '', kwh: '', unit_price_cop: '', qty_available: '', lead_time_days: '3' });
    } catch (e) {
      setErrNew(e.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const specCell = it => {
    if (it.equipment_type === 'panel' && it.wp) return `${it.wp} Wp`;
    if (it.equipment_type === 'inverter' && it.kw) return `${it.kw} kW`;
    if (it.equipment_type === 'battery' && it.kwh) return `${it.kwh} kWh`;
    return '—';
  };

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTER_OPTS.map(([v, l]) => (
          <FilterChip key={v} label={l} active={filter === v} onClick={() => setFilter(v)} />
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Tipo','Marca / Modelo','Especif.','Precio/ud','Disponible','Reservado','Estado','Acciones'].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 9, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '24px 8px', textAlign: 'center', color: C.muted, fontSize: 12 }}>Sin equipos en esta categoría.</td></tr>
            )}
            {filtered.map(it => {
              const isCritical = it.qty_available < 5;
              const isEditing  = editingId === it.id;
              return (
                <tr key={it.id} style={{
                  borderBottom: `1px solid ${C.border}`,
                  borderLeft: isCritical ? `3px solid ${C.amber}` : '3px solid transparent',
                  background: isCritical ? `${C.amber}08` : 'transparent',
                }}>
                  <td style={{ padding: '8px 8px', color: C.muted, whiteSpace: 'nowrap' }}>{EQUIP_TYPES[it.equipment_type] || it.equipment_type}</td>
                  <td style={{ padding: '8px 8px', color: '#fff', fontWeight: 600 }}>{it.brand} {it.model}</td>
                  <td style={{ padding: '8px 8px', color: C.muted }}>{specCell(it)}</td>
                  {/* Editable price */}
                  <td style={{ padding: '8px 8px' }}>
                    {isEditing
                      ? <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                          onBlur={() => commitEdit(it)} onKeyDown={e => e.key === 'Enter' && commitEdit(it)}
                          style={{ ...inp, width: 100, padding: '4px 6px', fontSize: 11 }} autoFocus />
                      : <span onClick={() => startEdit(it)} style={{ cursor: 'pointer', color: C.text, borderBottom: `1px dashed ${C.muted}` }} title="Clic para editar">{fmtCOP(it.unit_price_cop)}</span>
                    }
                  </td>
                  {/* Editable qty */}
                  <td style={{ padding: '8px 8px' }}>
                    {isEditing
                      ? <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)}
                          onBlur={() => commitEdit(it)} onKeyDown={e => e.key === 'Enter' && commitEdit(it)}
                          style={{ ...inp, width: 70, padding: '4px 6px', fontSize: 11 }} />
                      : <span onClick={() => startEdit(it)} style={{ cursor: 'pointer', color: isCritical ? C.red : C.text, fontWeight: isCritical ? 700 : 400, borderBottom: `1px dashed ${C.muted}` }} title="Clic para editar">{fmt(it.qty_available)}</span>
                    }
                  </td>
                  <td style={{ padding: '8px 8px', color: C.muted }}>{fmt(it.qty_reserved ?? 0)}</td>
                  <td style={{ padding: '8px 8px' }}>
                    <span style={pill(it.is_active ? C.green : C.muted)}>{it.is_active ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td style={{ padding: '8px 8px' }}>
                    {it.is_active && (
                      <button onClick={() => deactivate(it)} style={{ ...btnSmall('#f8717120'), color: C.red, border: `1px solid ${C.red}33` }}>Desactivar</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add item button */}
      {!showNew && (
        <button onClick={() => setShowNew(true)} style={{ ...btnPrimary, background: `${C.teal}22`, color: C.teal, border: `1px solid ${C.teal}55`, marginBottom: 6 }}>
          ⊕ Agregar equipo
        </button>
      )}

      {/* New item form */}
      {showNew && (
        <div style={{ ...card, borderColor: C.teal }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 14 }}>Nuevo equipo</div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ flex: '1 1 150px' }}>
              <label style={lbl}>Tipo *</label>
              <select value={newItem.equipment_type} onChange={e => setNewItem(p => ({ ...p, equipment_type: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                {Object.entries(EQUIP_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label style={lbl}>Marca *</label>
              <input value={newItem.brand} onChange={e => setNewItem(p => ({ ...p, brand: e.target.value }))} placeholder="Ej. JA Solar" style={inp} />
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label style={lbl}>Modelo *</label>
              <input value={newItem.model} onChange={e => setNewItem(p => ({ ...p, model: e.target.value }))} placeholder="Ej. JAM72S30-545" style={inp} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {newItem.equipment_type === 'panel' && (
              <div style={{ flex: '1 1 120px' }}>
                <label style={lbl}>Potencia (Wp) *</label>
                <input type="number" value={newItem.wp} onChange={e => setNewItem(p => ({ ...p, wp: e.target.value }))} placeholder="545" style={inp} />
              </div>
            )}
            {newItem.equipment_type === 'inverter' && (
              <div style={{ flex: '1 1 120px' }}>
                <label style={lbl}>Potencia (kW) *</label>
                <input type="number" value={newItem.kw} onChange={e => setNewItem(p => ({ ...p, kw: e.target.value }))} placeholder="5" style={inp} />
              </div>
            )}
            {newItem.equipment_type === 'battery' && (
              <div style={{ flex: '1 1 120px' }}>
                <label style={lbl}>Capacidad (kWh) *</label>
                <input type="number" value={newItem.kwh} onChange={e => setNewItem(p => ({ ...p, kwh: e.target.value }))} placeholder="10" style={inp} />
              </div>
            )}
            <div style={{ flex: '1 1 150px' }}>
              <label style={lbl}>Precio unitario (COP) *</label>
              <input type="number" value={newItem.unit_price_cop} onChange={e => setNewItem(p => ({ ...p, unit_price_cop: e.target.value }))} placeholder="1500000" style={inp} />
            </div>
            <div style={{ flex: '1 1 100px' }}>
              <label style={lbl}>Cantidad disponible *</label>
              <input type="number" value={newItem.qty_available} onChange={e => setNewItem(p => ({ ...p, qty_available: e.target.value }))} placeholder="20" style={inp} />
            </div>
            <div style={{ flex: '1 1 100px' }}>
              <label style={lbl}>Plazo entrega (días)</label>
              <input type="number" value={newItem.lead_time_days} onChange={e => setNewItem(p => ({ ...p, lead_time_days: e.target.value }))} placeholder="3" style={inp} />
            </div>
          </div>

          {errNew && <div style={{ color: C.red, fontSize: 11, marginBottom: 10 }}>{errNew}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCreate} disabled={saving} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>
              {saving ? <><Spinner size={13} color="#fff" /> Guardando…</> : '✓ Guardar equipo'}
            </button>
            <button onClick={() => setShowNew(false)} style={{ ...btnSmall(C.card), border: `1px solid ${C.border}`, color: C.muted }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ORDERS TAB
// ═════════════════════════════════════════════════════════════════════════════
function TabOrders({ orders, setOrders, supplier, jwt }) {
  const [filter, setFilter] = useState('all');
  const [trackingInputs, setTrackingInputs] = useState({}); // poId -> tracking code input
  const [updating, setUpdating] = useState({}); // poId -> bool

  const FILTER_OPTS = [
    ['all','Todos'], ['pendiente','Pendiente'], ['confirmado','Confirmado'],
    ['preparando','Preparando'], ['enviado','Enviado'], ['entregado','Entregado'],
    ['completado','Completado'],
  ];

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const doUpdate = async (poId, status, extra = {}) => {
    setUpdating(p => ({ ...p, [poId]: true }));
    try {
      await updateOrderStatus(poId, status, extra, jwt);
      setOrders(prev => prev.map(o => o.id === poId ? { ...o, status, ...extra } : o));
    } catch {}
    setUpdating(p => ({ ...p, [poId]: false }));
  };

  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTER_OPTS.map(([v, l]) => (
          <FilterChip key={v} label={l} active={filter === v} onClick={() => setFilter(v)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px', color: C.muted, fontSize: 13 }}>
          No hay pedidos{filter !== 'all' ? ` con estado "${FILTER_OPTS.find(f => f[0] === filter)?.[1]}"` : ''}.
        </div>
      )}

      {filtered.map(po => {
        const st = PO_STATUS[po.status] || { label: po.status, color: C.muted };
        const curIdx = PO_TIMELINE.indexOf(po.status);
        const isUpdating = !!updating[po.id];
        const feePct = supplier?.platform_fee_pct ?? PLATFORM_FEE_EQUIPMENT_PCT;
        const platformFee = Math.round((po.subtotal_equipment || 0) * feePct / 100);
        const supplierNet = (po.subtotal_equipment || 0) - platformFee;

        return (
          <div key={po.id} style={{ ...card, marginBottom: 14 }}>
            {/* Card header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{po.po_number}</span>
                <span style={{ fontSize: 11, color: C.muted, marginLeft: 10 }}>
                  {fmtDate(po.created_at)} · {po.client?.city}, {po.client?.dept}
                </span>
              </div>
              <span style={pill(st.color)}>{st.label}</span>
            </div>

            {/* Items table */}
            {po.items && po.items.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['Marca / Modelo','Qty','Precio/ud','Subtotal'].map(h => (
                        <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 9, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map((item, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '6px 8px', color: C.text }}>{item.brand} {item.model}</td>
                        <td style={{ padding: '6px 8px', color: C.muted }}>{item.qty}</td>
                        <td style={{ padding: '6px 8px', color: C.muted }}>{fmtCOP(item.unit_price_cop)}</td>
                        <td style={{ padding: '6px 8px', color: '#fff', fontWeight: 600 }}>{fmtCOP(item.line_total_cop)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Financial summary */}
            <div style={{ background: C.dark, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: C.muted }}>
                <span>Equipos:</span>
                <span>{fmtCOP(po.subtotal_equipment)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: C.red }}>
                <span>Comisión SolarHub ({feePct}%):</span>
                <span>-{fmtCOP(po.platform_fee_cop ?? platformFee)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13, color: C.green, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                <span>Neto para ti:</span>
                <span>{fmtCOP(po.supplier_net_cop ?? supplierNet)} ✓</span>
              </div>
            </div>

            {/* Timeline */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
              {PO_TIMELINE.map((step, idx) => {
                const isPast    = idx < curIdx;
                const isCurrent = idx === curIdx;
                const isFuture  = idx > curIdx;
                const dotColor  = isCurrent ? C.yellow : isPast ? C.teal : C.border;
                const lineColor = isPast ? C.teal : C.border;
                return (
                  <React.Fragment key={step}>
                    {idx > 0 && <div style={{ flex: 1, height: 2, background: lineColor, minWidth: 8 }} />}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <div style={{
                        width: isCurrent ? 12 : 8, height: isCurrent ? 12 : 8,
                        borderRadius: '50%',
                        background: dotColor,
                        border: isCurrent ? `2px solid ${C.yellow}` : 'none',
                        boxShadow: isCurrent ? `0 0 6px ${C.yellow}88` : 'none',
                      }} />
                      <span style={{ fontSize: 8, color: isCurrent ? C.yellow : isFuture ? C.muted : C.teal, whiteSpace: 'nowrap', fontWeight: isCurrent ? 700 : 400 }}>
                        {PO_STATUS[step]?.label || step}
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {po.status === 'pendiente' && (
                <>
                  <button onClick={() => doUpdate(po.id, 'confirmado')} disabled={isUpdating} style={{ ...btnSmall(C.teal), display: 'flex', alignItems: 'center', gap: 5 }}>
                    {isUpdating ? <Spinner size={11} color="#fff" /> : '✓'} Aceptar pedido
                  </button>
                  <button onClick={() => doUpdate(po.id, 'cancelado')} disabled={isUpdating} style={{ ...btnSmall('#f8717120'), color: C.red, border: `1px solid ${C.red}33` }}>
                    ✗ Rechazar
                  </button>
                </>
              )}
              {po.status === 'confirmado' && (
                <button onClick={() => doUpdate(po.id, 'preparando')} disabled={isUpdating} style={{ ...btnSmall(C.amber), display: 'flex', alignItems: 'center', gap: 5 }}>
                  {isUpdating ? <Spinner size={11} color="#fff" /> : '📦'} Marcar en preparación
                </button>
              )}
              {po.status === 'preparando' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    value={trackingInputs[po.id] || ''}
                    onChange={e => setTrackingInputs(p => ({ ...p, [po.id]: e.target.value }))}
                    placeholder="Código de tracking (opcional)"
                    style={{ ...inp, maxWidth: 220, padding: '6px 10px' }}
                  />
                  <button onClick={() => doUpdate(po.id, 'enviado', { tracking_code: trackingInputs[po.id] || '' })} disabled={isUpdating}
                    style={{ ...btnSmall('#3b82f6'), display: 'flex', alignItems: 'center', gap: 5 }}>
                    {isUpdating ? <Spinner size={11} color="#fff" /> : '🚚'} Marcar enviado
                  </button>
                </div>
              )}
              {po.status === 'enviado' && (
                <div style={{ fontSize: 11, color: C.muted }}>
                  Tracking: <span style={{ color: C.teal }}>{po.tracking_code || 'Sin código'}</span> · Esperando confirmación de entrega.
                </div>
              )}
              {po.status === 'entregado' && (
                <button onClick={() => doUpdate(po.id, 'instalado')} disabled={isUpdating} style={{ ...btnSmall(C.green), color: '#000', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {isUpdating ? <Spinner size={11} /> : '✓'} Marcar instalado
                </button>
              )}
              {['instalado','completado','cancelado'].includes(po.status) && (
                <div style={{ fontSize: 11, color: C.muted }}>
                  {po.status === 'completado' && `Completado: ${fmtDate(po.completed_at)}`}
                  {po.status === 'instalado'  && `Instalado: ${fmtDate(po.installed_at)}`}
                  {po.status === 'cancelado'  && 'Pedido cancelado.'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMMISSIONS TAB
// ═════════════════════════════════════════════════════════════════════════════
function TabCommissions({ orders, analytics, supplier }) {
  const feePct = supplier?.platform_fee_pct ?? PLATFORM_FEE_EQUIPMENT_PCT;
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const closedOrders = (orders || []).filter(o =>
    ['completado','instalado','enviado','entregado'].includes(o.status)
  );

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <MetricCard label="Comisión pendiente"  value={fmtCOP(analytics?.pendingCommission)}  color={C.yellow} />
        <MetricCard label="Pagada este mes"     value={fmtCOP(analytics?.paidCommission)}     color={C.green}  />
        <MetricCard label="Ingresos netos/mes"  value={fmtCOP(analytics?.netRevenueThisMonth)} color="#fff"     />
      </div>

      {/* Commissions table */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Detalle por pedido</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Nº PO','Fecha','Ciudad cliente','Bruto equipos','Comis. SH','Neto tuyo','Estado pago'].map(h => (
                  <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {closedOrders.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '20px 8px', color: C.muted, textAlign: 'center', fontSize: 12 }}>Aún no hay pedidos completados.</td></tr>
              )}
              {closedOrders.map(po => {
                const feeAmt = po.platform_fee_cop ?? Math.round((po.subtotal_equipment || 0) * feePct / 100);
                const net    = po.supplier_net_cop ?? ((po.subtotal_equipment || 0) - feeAmt);
                const paid   = po.status === 'completado';
                return (
                  <tr key={po.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '7px 8px', color: '#fff', fontWeight: 600 }}>{po.po_number}</td>
                    <td style={{ padding: '7px 8px', color: C.muted }}>{fmtDate(po.created_at)}</td>
                    <td style={{ padding: '7px 8px', color: C.muted }}>{po.client?.city}</td>
                    <td style={{ padding: '7px 8px', color: C.text }}>{fmtCOP(po.subtotal_equipment)}</td>
                    <td style={{ padding: '7px 8px', color: C.red }}>-{fmtCOP(feeAmt)}</td>
                    <td style={{ padding: '7px 8px', color: C.green, fontWeight: 700 }}>{fmtCOP(net)}</td>
                    <td style={{ padding: '7px 8px' }}>
                      <span style={pill(paid ? C.green : C.yellow)}>{paid ? 'Pagada' : 'Pendiente'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7, marginTop: 8, padding: '0 4px' }}>
        Los pagos netos se transfieren a tu cuenta bancaria registrada dentro de los <strong style={{ color: C.text }}>5 días hábiles</strong> siguientes a la confirmación de instalación.
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPANY TAB
// ═════════════════════════════════════════════════════════════════════════════
function TabCompany({ supplier, jwt }) {
  const [form, setForm] = useState({
    supplier_id: supplier?.id,
    company:  supplier?.company  || '',
    nit:      supplier?.nit      || '',
    city:     supplier?.city     || '',
    dept:     supplier?.dept     || '',
    phone:    supplier?.phone    || '',
    email:    supplier?.email    || '',
    bank_account: supplier?.bank_account || { banco: '', cuenta: '', tipo: 'Ahorros', titular: '' },
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const uBank = (k, v) => setForm(p => ({ ...p, bank_account: { ...p.bank_account, [k]: v } }));

  const handleSave = async () => {
    setSaving(true); setErr(''); setSaved(false);
    try {
      await updateProfile({ ...form }, jwt);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const supplierToken = supplier?.supplier_token || supplier?.token || '';
  const maskedToken   = supplierToken ? supplierToken.slice(0, 8) + '••••••••••••••••••••••••••••' : '—';
  const portalLink    = supplierToken ? `${window.location.origin}/?view=proveedor&token=${supplierToken}` : '';

  const copyLink = () => {
    if (!portalLink) return;
    navigator.clipboard.writeText(portalLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const Field = ({ label, value, onChange, type = 'text', placeholder = '' }) => (
    <div style={{ flex: '1 1 180px', minWidth: 160 }}>
      <label style={lbl}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inp} />
    </div>
  );

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 14 }}>Datos de la empresa</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <Field label="Razón social"  value={form.company} onChange={v => u('company', v)} placeholder="Mi Empresa SAS" />
          <Field label="NIT"           value={form.nit}     onChange={v => u('nit', v)}     placeholder="900.000.000-0" />
          <Field label="Ciudad"        value={form.city}    onChange={v => u('city', v)}    placeholder="Bogotá" />
          <Field label="Departamento"  value={form.dept}    onChange={v => u('dept', v)}    placeholder="Cundinamarca" />
          <Field label="Teléfono"      value={form.phone}   onChange={v => u('phone', v)}   placeholder="300 000 0000" />
          <Field label="Correo"        value={form.email}   onChange={v => u('email', v)}   placeholder="ventas@empresa.com" type="email" />
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 14 }}>Datos bancarios</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={lbl}>Banco</label>
            <input value={form.bank_account.banco} onChange={e => uBank('banco', e.target.value)} placeholder="Bancolombia, Davivienda…" style={inp} />
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <label style={lbl}>Tipo de cuenta</label>
            <select value={form.bank_account.tipo} onChange={e => uBank('tipo', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              <option value="Ahorros">Ahorros</option>
              <option value="Corriente">Corriente</option>
            </select>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={lbl}>Número de cuenta</label>
            <input value={form.bank_account.cuenta} onChange={e => uBank('cuenta', e.target.value)} placeholder="000-000000-00" style={inp} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={lbl}>Titular de la cuenta</label>
            <input value={form.bank_account.titular} onChange={e => uBank('titular', e.target.value)} placeholder="Nombre o razón social" style={inp} />
          </div>
        </div>

        {err && <div style={{ color: C.red, fontSize: 11, marginBottom: 10 }}>{err}</div>}
        {saved && <div style={{ color: C.green, fontSize: 11, marginBottom: 10 }}>✓ Cambios guardados correctamente.</div>}

        <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>
          {saving ? <><Spinner size={13} color="#fff" /> Guardando…</> : '✓ Guardar cambios'}
        </button>
      </div>

      {/* Token section */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Token de acceso</div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>
          Comparte este enlace con tu equipo para acceder al portal directamente sin contraseña.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ flex: 1, background: C.dark, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 11px', fontSize: 11, color: C.muted, fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {maskedToken}
          </code>
          <button onClick={copyLink} disabled={!portalLink} style={{ ...btnSmall(), whiteSpace: 'nowrap', opacity: !portalLink ? 0.4 : 1 }}>
            {copied ? '✓ Copiado' : '📋 Copiar enlace'}
          </button>
        </div>
        {portalLink && (
          <div style={{ fontSize: 10, color: C.muted, marginTop: 8, fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {portalLink.slice(0, 60)}…
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function SupplierPortal({ token }) {
  const [authState, setAuthState] = useState('login'); // 'login'|'loading'|'ready'|'error'
  const [supplier, setSupplier] = useState(null);
  const [jwt, setJwt] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [stock, setStock] = useState([]);
  const [orders, setOrders] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [initError, setInitError] = useState('');

  const TABS = [
    { id: 'dashboard',   icon: '🏠', label: 'Dashboard'  },
    { id: 'stock',       icon: '📦', label: 'Inventario' },
    { id: 'orders',      icon: '📋', label: 'Pedidos'    },
    { id: 'commissions', icon: '💰', label: 'Comisiones' },
    { id: 'company',     icon: '🏢', label: 'Empresa'    },
  ];

  const loadAll = useCallback(async (suppId, jwtToken) => {
    try {
      const [stockRes, ordersRes, analyticsRes] = await Promise.allSettled([
        getStock(suppId, jwtToken),
        getOrders(suppId, jwtToken),
        getAnalytics(suppId, jwtToken),
      ]);
      if (stockRes.status === 'fulfilled' && stockRes.value?.items) setStock(stockRes.value.items);
      if (ordersRes.status === 'fulfilled' && ordersRes.value?.orders) setOrders(ordersRes.value.orders);
      if (analyticsRes.status === 'fulfilled') setAnalytics(analyticsRes.value);
    } catch {}
  }, []);

  const handleAuthSuccess = useCallback((newJwt, newSupplier) => {
    setJwt(newJwt);
    setSupplier(newSupplier);
    setAuthState('ready');
    loadAll(newSupplier.id, newJwt);
  }, [loadAll]);

  // Mount: restore session or deep-link token
  useEffect(() => {
    const session = getSession();
    if (session) {
      handleAuthSuccess(session.jwt, session.supplier);
      return;
    }
    if (token) {
      setAuthState('loading');
      supplierAuth({ token })
        .then(data => {
          if (data.ok) handleAuthSuccess(data.jwt, data.supplier);
          else { setAuthState('login'); setInitError('Token inválido o expirado.'); }
        })
        .catch(() => { setAuthState('login'); setInitError('Error de conexión con el servidor.'); });
    }
  }, [token, handleAuthSuccess]);

  const handleRefresh = async () => {
    if (!supplier || !jwt) return;
    setRefreshing(true);
    await loadAll(supplier.id, jwt);
    setRefreshing(false);
  };

  const handleLogout = () => {
    clearSession();
    setAuthState('login');
    setSupplier(null);
    setJwt('');
    setStock([]);
    setOrders([]);
    setAnalytics(null);
  };

  // ── Styles ───────────────────────────────────────────────────────────────
  const styles = `
    @keyframes sp-spin { to { transform: rotate(360deg); } }
    * { box-sizing: border-box; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #07090F; }
    ::-webkit-scrollbar-thumb { background: #01708B44; border-radius: 3px; }
  `;

  // ── Loading state ────────────────────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{styles}</style>
        <div style={{ textAlign: 'center' }}>
          <Spinner size={32} />
          <div style={{ color: C.muted, marginTop: 16, fontSize: 13 }}>Verificando acceso…</div>
        </div>
      </div>
    );
  }

  // ── Login state ──────────────────────────────────────────────────────────
  if (authState === 'login') {
    return (
      <>
        <style>{styles}</style>
        <LoginScreen onSuccess={handleAuthSuccess} initError={initError} />
      </>
    );
  }

  // ── Portal (ready) ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.text, fontFamily: 'Outfit, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <style>{styles}</style>

      {/* Top bar */}
      <div style={{
        background: 'linear-gradient(180deg, #0A1018 0%, #08131f 100%)',
        borderBottom: `1px solid ${C.border}`,
        padding: '0 16px',
        height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 99,
        boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>📦</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontWeight: 900, fontSize: 16, color: '#fff' }}>Solar</span>
              <span style={{ fontWeight: 900, fontSize: 16, color: C.yellow }}>Hub</span>
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>Proveedores</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {supplier && (
            <div style={{ fontSize: 11, color: C.muted, textAlign: 'right', display: 'none' }} className="supplier-name">
              {supplier.company}
            </div>
          )}
          <span style={{ fontSize: 11, color: C.muted, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {supplier?.company}
          </span>
          <button onClick={handleLogout} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
            Salir
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        background: '#08131f',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        overflowX: 'auto',
        flexShrink: 0,
      }}>
        {TABS.map(t => (
          <TabBtn key={t.id} {...t} active={tab === t.id} onClick={setTab} />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '16px 14px', maxWidth: 900, width: '100%', margin: '0 auto' }}>
        {tab === 'dashboard' && (
          <TabDashboard
            analytics={analytics}
            orders={orders}
            stock={stock}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        )}
        {tab === 'stock' && (
          <TabStock
            stock={stock}
            setStock={setStock}
            supplier={supplier}
            jwt={jwt}
          />
        )}
        {tab === 'orders' && (
          <TabOrders
            orders={orders}
            setOrders={setOrders}
            supplier={supplier}
            jwt={jwt}
          />
        )}
        {tab === 'commissions' && (
          <TabCommissions
            orders={orders}
            analytics={analytics}
            supplier={supplier}
          />
        )}
        {tab === 'company' && (
          <TabCompany
            supplier={supplier}
            jwt={jwt}
          />
        )}
      </div>
    </div>
  );
}
