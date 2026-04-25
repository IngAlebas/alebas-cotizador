import React, { useState, useEffect } from 'react';
import {
  C, storage,
  DEFAULT_PANELS, DEFAULT_INVERTERS, DEFAULT_BATTERIES, DEFAULT_PRICING
} from './constants';
import Quoter from './components/Quoter';
import InstallerReg from './components/InstallerReg';
import BackOffice from './components/BackOffice';
import logo from './logo.png';

const ADMIN_HASH = 'sh_' + btoa('hoJSDU2!kaiv337c');

function AdminLogin({ onSuccess }) {
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(false);
  const [show, setShow] = useState(false);

  const check = () => {
    if ('sh_' + btoa(pwd) === ADMIN_HASH) {
      storage.set('sh:admin', '1');
      onSuccess();
    } else {
      setErr(true);
      setPwd('');
      setTimeout(() => setErr(false), 2000);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 54px)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: C.dark, padding: 24,
    }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 14, padding: '40px 36px',
        width: '100%', maxWidth: 380, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `${C.teal}18`, border: `2px solid ${C.teal}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 18px', fontSize: 22,
        }}>🔐</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Panel de administración</div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 26, fontFamily: 'monospace' }}>solar-hub.co · acceso restringido</div>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <input
            type={show ? 'text' : 'password'}
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && check()}
            placeholder="Contraseña de administrador"
            style={{
              width: '100%', background: C.dark,
              border: `1px solid ${err ? '#f87171' : C.border}`,
              borderRadius: 8, padding: '10px 44px 10px 14px',
              color: C.text, fontSize: 13, boxSizing: 'border-box',
            }}
            autoFocus
          />
          <button onClick={() => setShow(!show)} style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.muted, fontSize: 14, padding: 0,
          }}>{show ? '🙈' : '👁'}</button>
        </div>
        {err && (
          <div style={{
            fontSize: 11, color: '#f87171', background: '#f8717115',
            border: '1px solid #f8717133', borderRadius: 6,
            padding: '7px 12px', marginBottom: 14,
          }}>Contraseña incorrecta. Inténtalo de nuevo.</div>
        )}
        <button onClick={check} style={{
          width: '100%', background: C.teal, color: '#fff',
          border: 'none', borderRadius: 8, padding: '11px',
          fontWeight: 700, fontSize: 13, cursor: 'pointer',
          opacity: !pwd ? 0.5 : 1,
        }}>Ingresar al panel →</button>
        <div style={{ marginTop: 18, fontSize: 10, color: '#2a4050', fontFamily: 'monospace' }}>
          Solo personal autorizado de ALEBAS Ingeniería SAS
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('quoter');
  const [boTab, setBoTab] = useState('dashboard');
  const [adminAuth, setAdminAuth] = useState(false);
  const [panels, setPanels] = useState(DEFAULT_PANELS);
  const [inverters, setInverters] = useState(DEFAULT_INVERTERS);
  const [batteries, setBatteries] = useState(DEFAULT_BATTERIES);
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [quotes, setQuotes] = useState([]);
  const [installers, setInstallers] = useState([]);

  useEffect(() => {
    const g = (k, s) => {
      try { const r = storage.get(k); if (r?.value) s(JSON.parse(r.value)); } catch {}
    };
    g('al:panels', setPanels);
    g('al:inverters', setInverters);
    g('al:batteries', setBatteries);
    g('al:pricing', setPricing);
    g('al:quotes', setQuotes);
    g('al:installers', setInstallers);
    try {
      const r = storage.get('sh:admin');
      if (r?.value === '1') setAdminAuth(true);
    } catch {}
  }, []);

  const sv = (k, d) => storage.set(k, JSON.stringify(d));
  const uP = d => { setPanels(d); sv('al:panels', d); };
  const uI = d => { setInverters(d); sv('al:inverters', d); };
  const uB = d => { setBatteries(d); sv('al:batteries', d); };
  const uPr = d => { setPricing(d); sv('al:pricing', d); };
  const addQ = q => { const n = [q, ...quotes]; setQuotes(n); sv('al:quotes', n); };
  const addInst = i => { const n = [i, ...installers]; setInstallers(n); sv('al:installers', n); };
  const logout = () => { storage.set('sh:admin', '0'); setAdminAuth(false); setView('quoter'); };

  const NAV = [
    ['quoter',     '☀',  'Cotizador Solar'],
    ['instalador', '🔧', 'Ser Instalador'],
    ['backoffice', '⚙',  'Admin'],
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.text, display: 'flex', flexDirection: 'column' }}>

      {/* NAVBAR */}
      <nav style={{
        background: '#0A0E18', borderBottom: `2px solid ${C.teal}`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 54,
        position: 'sticky', top: 0, zIndex: 99, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => setView('quoter')}>
          <img src={logo} alt="SolarHub" style={{ height: 32, width: 32 }} />
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: '-0.5px', color: '#fff' }}>SOLAR</div>
            <div style={{ fontWeight: 300, fontSize: 15, letterSpacing: '5px', color: '#FF8C00', marginTop: -1 }}>HUB</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {NAV.map(([id, ic, l]) => (
            <button key={id} onClick={() => setView(id)} style={{
              padding: '5px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 12,
              background: view === id ? C.teal : `${C.teal}18`,
              color: view === id ? '#fff' : C.teal,
            }}>{ic} {l}</button>
          ))}
          {adminAuth && view === 'backoffice' && (
            <button onClick={logout} style={{
              padding: '5px 10px', borderRadius: 5,
              border: '1px solid #f8717133', cursor: 'pointer',
              fontWeight: 600, fontSize: 11,
              background: 'transparent', color: '#f87171', marginLeft: 4,
            }}>Salir ×</button>
          )}
        </div>
      </nav>

      {/* CONTENT */}
      <div style={{ flex: 1 }}>
        {view === 'quoter' && (
          <Quoter panels={panels} inverters={inverters}
            batteries={batteries} pricing={pricing} addQuote={addQ} />
        )}
        {view === 'instalador' && (
          <InstallerReg addInstaller={addInst} />
        )}
        {view === 'backoffice' && (
          adminAuth
            ? <BackOffice
                tab={boTab} setTab={setBoTab}
                panels={panels} uP={uP}
                inverters={inverters} uI={uI}
                batteries={batteries} uB={uB}
                pricing={pricing} uPr={uPr}
                quotes={quotes} installers={installers}
              />
            : <AdminLogin onSuccess={() => setAdminAuth(true)} />
        )}
      </div>

      {/* FOOTER */}
      <footer style={{
        borderTop: '1px solid #1C2D40', padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#050709', flexShrink: 0, flexWrap: 'wrap', gap: 12,
      }}>
        {/* Left: ALEBAS logo + info */}
        <a href="https://alebas.co" target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          {/* ALEBAS circle logo */}
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#01708B22', border: '1px solid #01708B55',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="4" fill="#01708B"/>
              <line x1="12" y1="12" x2="12" y2="3"  stroke="#01708B" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="12" y1="12" x2="19" y2="7"  stroke="#01708B" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="12" y1="12" x2="19" y2="17" stroke="#01708B" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="12" y1="12" x2="12" y2="21" stroke="#01708B" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="12" y1="12" x2="5"  y2="17" stroke="#01708B" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="12" y1="12" x2="5"  y2="7"  stroke="#01708B" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '-0.3px' }}>SolarHub</span>
              <span style={{ fontSize: 10, color: '#01708B', fontWeight: 600 }}>by ALEBAS Ingeniería SAS</span>
            </div>
            <div style={{ fontSize: 9, color: '#2a4050', fontFamily: 'monospace', marginTop: 2, letterSpacing: 0.5 }}>
              NIT 901.992.450-5 · Ley 1715 · CREG 174/2021 · RETIE · © 2026
            </div>
          </div>
        </a>

        {/* Right: partner badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: '#2a4050', fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase' }}>Mayoristas</span>
          {/* ALEBAS badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 6,
            background: '#01708B18', border: '1px solid #01708B44',
          }}>
            <span style={{ fontSize: 11, color: '#01708B' }}>⚡</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#01708B', letterSpacing: 0.5 }}>ALEBAS</span>
          </div>
          {/* Must Energy badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 6,
            background: '#EFDB0018', border: '1px solid #EFDB0044',
          }}>
            <span style={{ fontSize: 11, color: '#EFDB00' }}>🔋</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#EFDB00', letterSpacing: 0.5 }}>Must Energy</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
