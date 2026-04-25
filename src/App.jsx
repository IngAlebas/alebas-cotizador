import React, { useState, useEffect } from 'react';
import {
  C, storage,
  DEFAULT_PANELS, DEFAULT_INVERTERS, DEFAULT_BATTERIES, DEFAULT_PRICING, OPERATORS
} from './constants';
import Quoter from './components/Quoter';
import InstallerReg from './components/InstallerReg';
import BackOffice from './components/BackOffice';
import SupplierPortal from './components/SupplierPortal';
import { fetchLoadsCatalog, DEFAULT_LOADS_CATALOG } from './services/loads';
import logo from './logo.svg';

const ADMIN_HASH = 'sh_' + btoa('hoJSDU2!kaiv337c');

function AdminLogin({ onSuccess }) {
  const [pwd, setPwd] = React.useState('');
  const [err, setErr] = React.useState(false);
  const [show, setShow] = React.useState(false);
  const check = () => {
    if ('sh_' + btoa(pwd) === ADMIN_HASH) { storage.set('sh:admin','1'); onSuccess(); }
    else { setErr(true); setPwd(''); setTimeout(()=>setErr(false),2000); }
  };
  return (
    <div style={{minHeight:'calc(100vh - 56px)',display:'flex',alignItems:'center',justifyContent:'center',background:C.dark,padding:24}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:'40px 36px',width:'100%',maxWidth:380,textAlign:'center'}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:`${C.teal}18`,border:`2px solid ${C.teal}44`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px',fontSize:22}}>🔐</div>
        <div style={{fontSize:17,fontWeight:700,color:'#fff',marginBottom:4}}>Panel de administración</div>
        <div style={{fontSize:11,color:C.muted,marginBottom:26,fontFamily:'monospace'}}>solar-hub.co · acceso restringido</div>
        <div style={{position:'relative',marginBottom:14}}>
          <input type={show?'text':'password'} value={pwd} onChange={e=>setPwd(e.target.value)} onKeyDown={e=>e.key==='Enter'&&check()} placeholder="Contraseña de administrador"
            style={{width:'100%',background:C.dark,border:`1px solid ${err?'#f87171':C.border}`,borderRadius:8,padding:'10px 44px 10px 14px',color:C.text,fontSize:13,boxSizing:'border-box'}} autoFocus/>
          <button onClick={()=>setShow(!show)} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:C.muted,fontSize:14,padding:0}}>{show?'🙈':'👁'}</button>
        </div>
        {err&&<div style={{fontSize:11,color:'#f87171',background:'#f8717115',border:'1px solid #f8717133',borderRadius:6,padding:'7px 12px',marginBottom:14}}>Contraseña incorrecta.</div>}
        <button onClick={check} style={{width:'100%',background:C.teal,color:'#fff',border:'none',borderRadius:8,padding:'11px',fontWeight:700,fontSize:13,cursor:'pointer',opacity:!pwd?0.5:1}}>Ingresar al panel →</button>
        <div style={{marginTop:18,fontSize:10,color:'#2a4050',fontFamily:'monospace'}}>Solo personal autorizado de ALEBAS Ingeniería SAS</div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('quoter');
  const [adminAuth, setAdminAuth] = React.useState(false);
  const [boTab, setBoTab] = useState('dashboard');
  const [panels, setPanels] = useState(DEFAULT_PANELS);
  const [inverters, setInverters] = useState(DEFAULT_INVERTERS);
  const [batteries, setBatteries] = useState(DEFAULT_BATTERIES);
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [operators, setOperators] = useState(OPERATORS);
  const [quotes, setQuotes] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loadsCatalog, setLoadsCatalog] = useState(DEFAULT_LOADS_CATALOG);
  const [loadsSource, setLoadsSource] = useState('local-default');

  useEffect(() => {
    // Union-merge equipment lists: keep saved items (custom prices/specs) AND
    // inject any new default items added since the user's last visit.
    const gMerge = (k, defaults, setter) => {
      try {
        const r = storage.get(k);
        if (r?.value) {
          const saved = JSON.parse(r.value);
          const ids = new Set(saved.map(x => x.id));
          const merged = [...saved, ...defaults.filter(d => !ids.has(d.id))];
          setter(merged);
          return;
        }
      } catch {}
    };
    const g = (k, s) => {
      try { const r = storage.get(k); if (r?.value) s(JSON.parse(r.value)); } catch {}
    };
    gMerge('al:panels', DEFAULT_PANELS, setPanels);
    gMerge('al:inverters', DEFAULT_INVERTERS, setInverters);
    gMerge('al:batteries', DEFAULT_BATTERIES, setBatteries);
    g('al:pricing', setPricing);
    g('al:operators', setOperators);
    g('al:quotes', setQuotes);
    g('al:installers', setInstallers);
    g('al:suppliers', setSuppliers);
    // Intento de hidratar cuadro de cargas desde n8n (no bloquea UI).
    fetchLoadsCatalog().then(d => {
      if (Array.isArray(d?.items) && d.items.length) {
        setLoadsCatalog(d.items);
        setLoadsSource(d.source || 'n8n');
      }
    }).catch(() => {});
      try { const r = storage.get('sh:admin'); if (r?.value==='1') setAdminAuth(true); } catch {}
  }, []);

  const sv = (k, d) => storage.set(k, JSON.stringify(d));
  const uP = d => { setPanels(d); sv('al:panels', d); };
  const uI = d => { setInverters(d); sv('al:inverters', d); };
  const uB = d => { setBatteries(d); sv('al:batteries', d); };
  const uPr = d => { setPricing(d); sv('al:pricing', d); };
  const uOp = d => { setOperators(d); sv('al:operators', d); };
  const addQ = q => { const n = [q, ...quotes]; setQuotes(n); sv('al:quotes', n); };
  const addInst = i => { const n = [i, ...installers]; setInstallers(n); sv('al:installers', n); };
  const addSupp = s => { const n = [s, ...suppliers]; setSuppliers(n); sv('al:suppliers', n); };
  const uSupp = d => { setSuppliers(d); sv('al:suppliers', d); };

  const logout = () => { storage.set('sh:admin','0'); setAdminAuth(false); setView('quoter'); };

  const NAV = [
    ['quoter', '☀', 'Cotizador Solar'],
    ['instalador', '🔧', 'Ser Instalador'],
    ['proveedor', '📄', 'Proveedores'],
    ['backoffice', '⚙', 'Admin'],
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.text, display: 'flex', flexDirection: 'column', paddingBottom: 'var(--footer-h, 64px)' }}>
      <nav className="al-nav" style={{
        background: '#08151e', borderBottom: `2px solid ${C.teal}`,
        padding: '6px 12px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 8, minHeight: 56,
        position: 'sticky', top: 0, zIndex: 99, flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <img src={logo} alt="SolarHub by ALEBAS Ingeniería" className="al-logo" style={{ height: 38, width: 'auto' }} />
          <div className="al-brand" style={{ lineHeight: 1.05, borderLeft: `1px solid ${C.teal}44`, paddingLeft: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>
              Solar<span style={{ color: C.yellow }}>Hub</span>
            </div>
            <div style={{ fontSize: 8, color: C.teal, fontWeight: 600, letterSpacing: 1.2 }}>BY ALEBAS INGENIERÍA</div>
          </div>
        </div>
        <div className="al-nav-btns" style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {NAV.map(([id, ic, l]) => (
            <button key={id} onClick={() => setView(id)} className="al-nav-btn" style={{
              padding: '6px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 12,
              background: view === id ? C.teal : 'rgba(1,112,139,0.1)',
              color: view === id ? '#fff' : C.teal,
              whiteSpace: 'nowrap',
            }}>{ic} <span className="al-nav-label">{l}</span></button>
          ))}
          {adminAuth && view==='backoffice' && <button onClick={logout} style={{padding:'5px 10px',borderRadius:5,border:'1px solid #f8717133',cursor:'pointer',fontWeight:600,fontSize:11,background:'transparent',color:'#f87171',marginLeft:4}}>Salir ×</button>}
        </div>
      </nav>

      {view === 'quoter' && (
        <Quoter
          panels={panels} inverters={inverters}
          batteries={batteries} pricing={pricing}
          operators={operators}
          addQuote={addQ}
          loadsCatalog={loadsCatalog}
        />
      )}
      {view === 'instalador' && <InstallerReg addInstaller={addInst} />}
      {view === 'proveedor' && <SupplierPortal addSupplierSubmission={addSupp} />}
      {view === 'backoffice' && (
          adminAuth ? <BackOffice
          tab={boTab} setTab={setBoTab}
          panels={panels} uP={uP}
          inverters={inverters} uI={uI}
          batteries={batteries} uB={uB}
          pricing={pricing} uPr={uPr}
          operators={operators} uOp={uOp}
          quotes={quotes} installers={installers}
          suppliers={suppliers} uSupp={uSupp}
          loadsCatalog={loadsCatalog} loadsSource={loadsSource}
          setLoadsCatalog={setLoadsCatalog} setLoadsSource={setLoadsSource}
        /> : <AdminLogin onSuccess={()=>setAdminAuth(true)}/>
      )}

      <footer className="al-footer" style={{
        background: '#08151e', borderTop: `1px solid ${C.teal}44`,
        padding: '8px 12px', position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 98, boxShadow: '0 -2px 10px rgba(0,0,0,0.4)'
      }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div className="al-foot-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <img src={logo} alt="SolarHub" style={{ height: 22, opacity: 0.9, flexShrink: 0 }} />
              <div style={{ fontSize: 9, color: C.muted, lineHeight: 1.25, minWidth: 0 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>Solar<span style={{ color: C.yellow }}>Hub</span></span>
                  <span style={{ color: C.teal, fontWeight: 600, marginLeft: 5 }}>by ALEBAS Ingeniería SAS</span>
                </div>
                <div className="al-foot-legal">NIT 901.992.450-5 · Ley 1715 · CREG 174/2021 · RETIE · © {new Date().getFullYear()}</div>
              </div>
            </div>

            <div className="al-mayoristas" style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Mayoristas</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${C.teal}18`, border: `1px solid ${C.teal}44`, borderRadius: 5, padding: '3px 8px' }}>
                <span style={{ fontSize: 11 }}>⚡</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.teal }}>ALEBAS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${C.yellow}18`, border: `1px solid ${C.yellow}44`, borderRadius: 5, padding: '3px 8px' }}>
                <span style={{ fontSize: 11 }}>🔋</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.yellow }}>Must Energy</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
