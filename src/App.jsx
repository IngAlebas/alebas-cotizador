import React, { useState, useEffect } from 'react';
import {
  C, storage,
  DEFAULT_PANELS, DEFAULT_INVERTERS, DEFAULT_BATTERIES, DEFAULT_PRICING, OPERATORS
} from './constants';
import Quoter from './components/Quoter';
import InstallerReg from './components/InstallerReg';
import BackOffice from './components/BackOffice';
import SupplierPortal from './components/SupplierPortal';
import logo from './logo.png';

export default function App() {
  const [view, setView] = useState('quoter');
  const [boTab, setBoTab] = useState('dashboard');
  const [panels, setPanels] = useState(DEFAULT_PANELS);
  const [inverters, setInverters] = useState(DEFAULT_INVERTERS);
  const [batteries, setBatteries] = useState(DEFAULT_BATTERIES);
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [operators, setOperators] = useState(OPERATORS);
  const [quotes, setQuotes] = useState([]);
  const [installers, setInstallers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

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

  const NAV = [
    ['quoter', '☀', 'Cotizador Solar'],
    ['instalador', '🔧', 'Ser Instalador'],
    ['proveedor', '📄', 'Proveedores'],
    ['backoffice', '⚙', 'Admin'],
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.text }}>
      <nav style={{
        background: '#08151e', borderBottom: `2px solid #059669`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 56,
        position: 'sticky', top: 0, zIndex: 99
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="SolarHub by ALEBAS" style={{ height: 34, width: 'auto', borderRadius: 4 }} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>
              Solar<span style={{ color: '#f59e0b' }}>Hub</span>
            </div>
            <div style={{ fontSize: 9, color: '#059669', fontWeight: 600, letterSpacing: 1.2 }}>BY ALEBAS INGENIERÍA</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {NAV.map(([id, ic, l]) => (
            <button key={id} onClick={() => setView(id)} style={{
              padding: '5px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 12,
              background: view === id ? '#059669' : 'rgba(5,150,105,0.1)',
              color: view === id ? '#fff' : '#059669',
            }}>{ic} {l}</button>
          ))}
        </div>
      </nav>

      {view === 'quoter' && (
        <Quoter
          panels={panels} inverters={inverters}
          batteries={batteries} pricing={pricing}
          operators={operators}
          addQuote={addQ}
        />
      )}
      {view === 'instalador' && <InstallerReg addInstaller={addInst} />}
      {view === 'proveedor' && <SupplierPortal addSupplierSubmission={addSupp} />}
      {view === 'backoffice' && (
        <BackOffice
          tab={boTab} setTab={setBoTab}
          panels={panels} uP={uP}
          inverters={inverters} uI={uI}
          batteries={batteries} uB={uB}
          pricing={pricing} uPr={uPr}
          operators={operators} uOp={uOp}
          quotes={quotes} installers={installers}
          suppliers={suppliers} uSupp={uSupp}
        />
      )}

      <footer style={{ background: '#08151e', borderTop: '1px solid #05966922', marginTop: 32, padding: '28px 16px 20px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 2 }}>
                Solar<span style={{ color: '#f59e0b' }}>Hub</span>
              </div>
              <div style={{ fontSize: 10, color: '#059669', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>BY ALEBAS INGENIERÍA SAS</div>
              <div style={{ fontSize: 11, color: '#7a9eaa', lineHeight: 1.7 }}>
                NIT 901.992.450-5<br />
                Villavicencio, Meta — Colombia<br />
                info@alebas.co
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#7a9eaa', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>Alianza mayorista</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#05966912', border: '1px solid #05966933', borderRadius: 8, padding: '8px 14px' }}>
                <span style={{ fontSize: 18 }}>🌞</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>Solar Hub Colombia</div>
                  <div style={{ fontSize: 10, color: '#7a9eaa' }}>Longi · CPS · Precios mayoristas</div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #05966920', paddingTop: 14, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 10, color: '#7a9eaa' }}>© {new Date().getFullYear()} ALEBAS INGENIERÍA SAS · Todos los derechos reservados</div>
            <div style={{ fontSize: 10, color: '#7a9eaa' }}>Marco regulatorio: Ley 1715/2014 · CREG 174/2021 · CREG 135/2021 · RETIE</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
