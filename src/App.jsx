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
    const g = (k, s) => {
      try { const r = storage.get(k); if (r?.value) s(JSON.parse(r.value)); } catch {}
    };
    g('al:panels', setPanels);
    g('al:inverters', setInverters);
    g('al:batteries', setBatteries);
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
        background: '#08151e', borderBottom: `2px solid ${C.teal}`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 54,
        position: 'sticky', top: 0, zIndex: 99
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={logo} alt="ALEBAS Ingeniería" style={{ height: 36, width: 'auto', borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {NAV.map(([id, ic, l]) => (
            <button key={id} onClick={() => setView(id)} style={{
              padding: '5px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 12,
              background: view === id ? C.teal : 'rgba(1,112,139,0.1)',
              color: view === id ? '#fff' : C.teal,
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
    </div>
  );
}
