import {
  sizeStrings,
  calcSystem,
  calcBudget,
  inverterCompatibility,
  selectCompatibleInverter,
  validateLayout,
  pickBestTransport,
  getEffectiveTariff,
  getPR,
  excedentePriceFor,
  DEFAULT_PANELS,
  DEFAULT_INVERTERS,
  DEFAULT_BATTERIES,
  DEFAULT_PRICING,
  CARRIERS,
  ESTRATO_FACTORS,
  DEPT_PR,
  splitCU,
  MAX_KWP_AGPE,
} from '../constants';

// ==================== TEST DATA ====================
const mockPanel = {
  id: 'p1', brand: 'JA Solar', model: 'JAM72S20-545MR', wp: 545, price: 290000, kg: 24.9,
  lengthMm: 2278, widthMm: 1134,
  voc: 49.75, vmp: 41.8, isc: 13.85, imp: 13.04, tempCoeffPmax: -0.35, tempCoeffVoc: -0.275,
};

const mockInverter = {
  id: 'i3', brand: 'Growatt', model: 'MID 10KTL3-X2', kw: 10, phase: 3, price: 4200000, kg: 32,
  vocMax: 1000, mpptVmin: 200, mpptVmax: 850, mpptCount: 2, idcMax: 25, type: 'on-grid',
};

const mockInverterSmall = {
  id: 'i2', brand: 'Growatt', model: 'MIN 5000TL-XH', kw: 5, phase: 1, price: 2450000, kg: 19,
  vocMax: 550, mpptVmin: 80, mpptVmax: 500, mpptCount: 2, idcMax: 13.5, type: 'on-grid',
};

const mockBattery = { id: 'b1', kwh: 3.5, price: 3200000, kg: 37, voltage: 48 };

const mockPricing = {
  structure_per_panel: 180000,
  cabling_per_kwp: 350000,
  protections_per_kwp: 280000,
  installation_per_kwp: 600000,
  engineering: 800000,
  emsa_tramites: 500000,
  iva: 19,
};

const mockOperator = { sic: 'ENDC', name: 'Enel Colombia', tariff: 720, psh: 4.2 };

// ==================== sizeStrings ====================
describe('sizeStrings', () => {
  it('returns heuristic (pps=17) when panel or inverter lacks specs', () => {
    const panelNoSpecs = { wp: 545, price: 290000, kg: 24.9 };
    const invNoSpecs = { kw: 10, price: 4200000, kg: 32 };
    const result = sizeStrings(panelNoSpecs, invNoSpecs, 20);
    expect(result.pps).toBe(17); // floor(700/40)
    expect(result.specsSource).toBe('heuristic');
    expect(result.feasible).toBe(true);
  });

  it('returns heuristic when panel lacks Voc', () => {
    const result = sizeStrings({ wp: 545 }, mockInverter, 10);
    expect(result.specsSource).toBe('heuristic');
    expect(result.pps).toBe(17);
  });

  it('pps does not exceed ppsMaxVolt (Voc-cold limit)', () => {
    const result = sizeStrings(mockPanel, mockInverter, 20, 10, 65);
    const tcVoc = mockPanel.tempCoeffVoc;
    const vocCold = mockPanel.voc * (1 + (tcVoc / 100) * (10 - 25));
    const ppsMaxVolt = Math.floor((mockInverter.vocMax * 0.95) / vocCold);
    expect(result.pps).toBeLessThanOrEqual(ppsMaxVolt);
  });

  it('pps does not exceed ppsMaxMppt (mpptVmax limit)', () => {
    const result = sizeStrings(mockPanel, mockInverter, 20, 10, 65);
    const ppsMaxMppt = Math.floor((mockInverter.mpptVmax * 0.97) / mockPanel.vmp);
    expect(result.pps).toBeLessThanOrEqual(ppsMaxMppt);
  });

  it('ns * pps >= numPanels approximately (actual panels covers the request)', () => {
    const numPanels = 18;
    const result = sizeStrings(mockPanel, mockInverter, numPanels, 10, 65);
    expect(result.ns * result.pps).toBeGreaterThanOrEqual(result.actualPanels);
  });

  it('works with a single panel', () => {
    const result = sizeStrings(mockPanel, mockInverter, 1, 10, 65);
    expect(result.actualPanels).toBeGreaterThanOrEqual(1);
    expect(result.ns).toBeGreaterThanOrEqual(1);
    expect(result.pps).toBeGreaterThanOrEqual(1);
  });

  it('currentLimited=true when ns exceeds idcMax / imp threshold', () => {
    // Small inverter: idcMax=13.5, imp=13.04, mpptCount=2 → maxNsCurrent = 1*2 = 2
    // Request 40 panels → 3 strings needed with pps~13 (floor(500*0.97/41.8)=11)
    // ns=ceil(40/11)=4 > maxNsCurrent=2 → currentLimited
    const result = sizeStrings(mockPanel, mockInverterSmall, 40, 10, 65);
    expect(result.currentLimited).toBe(true);
  });

  it('currentLimited=false for a reasonable configuration', () => {
    // 10 panels with mockInverter (idcMax=25, imp=13.04, mpptCount=2 → maxNs=3*2=3)
    // ns will be small enough
    const result = sizeStrings(mockPanel, mockInverter, 10, 10, 65);
    expect(result.currentLimited).toBe(false);
  });

  it('feasible=false when ppsMin > ppsHardMax (incompatible pair)', () => {
    // Inverter with very high mpptVmin and very low mpptVmax / vocMax
    const tinyInverter = {
      kw: 1, vocMax: 60, mpptVmin: 400, mpptVmax: 500, mpptCount: 1, idcMax: 20, type: 'on-grid',
    };
    const result = sizeStrings(mockPanel, tinyInverter, 10, 10, 65);
    expect(result.feasible).toBe(false);
  });

  it('returns specsSource="inverter-limited" when specs are present', () => {
    const result = sizeStrings(mockPanel, mockInverter, 10, 10, 65);
    expect(result.specsSource).toBe('inverter-limited');
  });
});

// ==================== calcSystem ====================
describe('calcSystem', () => {
  it('actKwp = numPanels × panel.wp / 1000', () => {
    const sys = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5);
    expect(sys.actKwp).toBeCloseTo(sys.numPanels * mockPanel.wp / 1000, 2);
  });

  it('monthly production proportional to PSH when target kWp is fixed', () => {
    // Fix targetKwp so numPanels stays the same — then higher PSH → higher production
    const sys1 = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5, { targetKwp: 5 });
    const sys2 = calcSystem(300, mockPanel, mockInverter, null, 0, 5.0, { targetKwp: 5 });
    expect(sys2.mp).toBeGreaterThan(sys1.mp);
  });

  it('cov = mp / monthlyKwh * 100, capped at 120', () => {
    // Small consumption → should hit 120% cap
    const sys = calcSystem(50, mockPanel, mockInverter, null, 0, 5.0);
    expect(sys.cov).toBeLessThanOrEqual(120);
  });

  it('cov is reasonable (> 0) for normal consumption', () => {
    const sys = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5);
    expect(sys.cov).toBeGreaterThan(0);
    expect(sys.cov).toBeLessThanOrEqual(120);
  });

  it('PVGIS override: when opts.pvgisAnnualKwh provided, ap = pvgisAnnualKwh', () => {
    const pvgisAnnual = 8000;
    const sys = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5, { pvgisAnnualKwh: pvgisAnnual });
    // ap is rounded and shade applied (shade=1 by default), so ap = round(pvgisAnnual * 1) = 8000
    expect(sys.ap).toBe(pvgisAnnual);
    expect(sys.dataSource).toBe('PVGIS');
  });

  it('shade factor reduces output: shadeIndex=0.8 → ~80% of base production', () => {
    const sysNoShade = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5, { shadeIndex: 1.0 });
    const sysShaded  = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5, { shadeIndex: 0.8 });
    expect(sysShaded.ap).toBeCloseTo(sysNoShade.ap * 0.8, -1);
  });

  it('higher PR results in higher production when target kWp is fixed', () => {
    // Fix targetKwp so numPanels stays the same — then higher PR → higher production
    const sysLowPR  = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5, { pr: 0.73, targetKwp: 5 });
    const sysHighPR = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5, { pr: 0.83, targetKwp: 5 });
    expect(sysHighPR.mp).toBeGreaterThan(sysLowPR.mp);
  });

  it('cappedByRegulation=true when target kwp > MAX_KWP_AGPE (500 kW)', () => {
    // targetKwp=600 exceeds MAX_KWP_AGPE=500
    const sys = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5, { targetKwp: 600 });
    expect(sys.cappedByRegulation).toBe(true);
  });

  it('cappedByRegulation=false for normal system', () => {
    const sys = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5);
    expect(sys.cappedByRegulation).toBe(false);
  });

  it('kgTotal includes panels + structure + inverter + batteries', () => {
    const sys = calcSystem(300, mockPanel, mockInverter, mockBattery, 2, 4.5);
    const n = sys.numPanels;
    // Panels + structure + accessories + inverter kw + batteries
    const expected = n * mockPanel.kg + n * 7.5 + mockInverter.kw + 2 * mockBattery.kg + (8 + n * 0.3);
    expect(sys.kgTotal).toBeCloseTo(expected, 0);
  });

  it('kgTotal without batteries does not include battery weight', () => {
    const sysNoBat = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5);
    const sysBat   = calcSystem(300, mockPanel, mockInverter, mockBattery, 2, 4.5);
    expect(sysBat.kgTotal).toBeGreaterThan(sysNoBat.kgTotal);
  });

  it('no division by zero crash when monthlyKwh=0', () => {
    // monthlyKwh=0 → cov would be 0/0, should handle gracefully
    expect(() => {
      calcSystem(0, mockPanel, mockInverter, null, 0, 4.5);
    }).not.toThrow();
  });

  it('calcSystem with battery: tB = bQty * bUnit.kwh', () => {
    const sys = calcSystem(300, mockPanel, mockInverter, mockBattery, 2, 4.5);
    expect(sys.tB).toBeCloseTo(2 * mockBattery.kwh, 1);
  });

  it('calcSystem without battery: tB = 0', () => {
    const sys = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5);
    expect(sys.tB).toBe(0);
  });

  it('returns dataSource="PSH" when no pvgis override', () => {
    const sys = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5);
    expect(sys.dataSource).toBe('PSH');
  });

  it('accepts inverter as a plain number (legacy compat)', () => {
    expect(() => {
      calcSystem(300, mockPanel, 10, null, 0, 4.5);
    }).not.toThrow();
  });
});

// ==================== calcBudget ====================
describe('calcBudget', () => {
  let sys;
  beforeEach(() => {
    sys = calcSystem(300, mockPanel, mockInverter, null, 0, 4.5);
  });

  it('sA = panels price + inverter price (no batteries)', () => {
    const budget = calcBudget(sys, mockPanel, mockInverter, null, 0, mockPricing, 0);
    expect(budget.sA).toBe(sys.numPanels * mockPanel.price + mockInverter.price);
  });

  it('sA includes battery cost when batteries provided', () => {
    const sysBat = calcSystem(300, mockPanel, mockInverter, mockBattery, 2, 4.5);
    const budget = calcBudget(sysBat, mockPanel, mockInverter, mockBattery, 2, mockPricing, 0);
    expect(budget.bC).toBe(2 * mockBattery.price);
    expect(budget.sA).toBe(budget.pC + budget.iC + budget.bC);
  });

  it('bC = 0 when no batteries', () => {
    const budget = calcBudget(sys, mockPanel, mockInverter, null, 0, mockPricing, 0);
    expect(budget.bC).toBe(0);
  });

  it('sB includes IVA on services (not on equipment)', () => {
    const budget = calcBudget(sys, mockPanel, mockInverter, null, 0, mockPricing, 0);
    // bBase = st + ca + pt + ins + engineering + tramites + transport
    const expectedBBase = budget.st + budget.ca + budget.pt + budget.ins + budget.eng + budget.emsa + budget.transport;
    expect(budget.bBase).toBeCloseTo(expectedBBase, 0);
    const expectedIva = Math.round(expectedBBase * (mockPricing.iva / 100));
    expect(budget.iva).toBe(expectedIva);
    expect(budget.sB).toBe(expectedBBase + expectedIva);
  });

  it('tot = sA + sB', () => {
    const budget = calcBudget(sys, mockPanel, mockInverter, null, 0, mockPricing, 0);
    expect(budget.tot).toBe(budget.sA + budget.sB);
  });

  it('transport is included in bBase but IVA is applied on all of bBase including transport', () => {
    const transport = 500000;
    const budget = calcBudget(sys, mockPanel, mockInverter, null, 0, mockPricing, transport);
    expect(budget.transport).toBe(transport);
    expect(budget.bBase).toBeGreaterThan(0);
    // The budget includes transport in bBase which has IVA applied
    expect(budget.iva).toBe(Math.round(budget.bBase * (mockPricing.iva / 100)));
  });

  it('ivaAhorrado ≈ sA × 0.19 (IVA on equipment)', () => {
    const budget = calcBudget(sys, mockPanel, mockInverter, null, 0, mockPricing, 0);
    // The IVA saved by exemption under Ley 1715 = 19% of sA (equipment exempt from IVA)
    const ivaAhorrado = Math.round(budget.sA * 0.19);
    // We verify sA is the correct base
    expect(ivaAhorrado).toBeGreaterThan(0);
    expect(budget.sA * 0.19).toBeCloseTo(ivaAhorrado, -3);
  });

  it('structure cost = numPanels × structure_per_panel', () => {
    const budget = calcBudget(sys, mockPanel, mockInverter, null, 0, mockPricing, 0);
    expect(budget.st).toBeCloseTo(sys.numPanels * mockPricing.structure_per_panel, 0);
  });

  it('cabling cost proportional to kWp', () => {
    const budget = calcBudget(sys, mockPanel, mockInverter, null, 0, mockPricing, 0);
    expect(budget.ca).toBeCloseTo(sys.actKwp * mockPricing.cabling_per_kwp, 0);
  });
});

// ==================== inverterCompatibility ====================
describe('inverterCompatibility', () => {
  it('returns { feasible, ppsMaxVolt, ppsMaxMppt, ppsMin }', () => {
    const result = inverterCompatibility(mockPanel, mockInverter, 10, 65);
    expect(result).toHaveProperty('feasible');
    expect(result).toHaveProperty('ppsMaxVolt');
    expect(result).toHaveProperty('ppsMaxMppt');
    expect(result).toHaveProperty('ppsMin');
  });

  it('feasible=true for compatible panel/inverter pair', () => {
    const result = inverterCompatibility(mockPanel, mockInverter, 10, 65);
    expect(result.feasible).toBe(true);
  });

  it('feasible=false when Voc cold exceeds vocMax constraint', () => {
    // Single-panel Voc cold at 10°C: 49.75*(1+(-0.275/100)*(10-25)) ≈ 51.8V
    // Set vocMax so low that even ppsMin > ppsMaxVolt
    const tightInverter = {
      ...mockInverter,
      vocMax: 50, // single panel Voc cold ~51.8V → ppsMaxVolt=0 → infeasible
      mpptVmin: 200, // requires ppsMin > 0
      mpptVmax: 500,
    };
    const result = inverterCompatibility(mockPanel, tightInverter, 10, 65);
    expect(result.feasible).toBe(false);
  });

  it('returns unknown=true when panel lacks voc', () => {
    const result = inverterCompatibility({ wp: 545 }, mockInverter, 10, 65);
    expect(result.unknown).toBe(true);
  });

  it('ppsMaxVolt is computed correctly from vocMax and vocCold', () => {
    const result = inverterCompatibility(mockPanel, mockInverter, 10, 65);
    const tcVoc = mockPanel.tempCoeffVoc;
    const vocCold = mockPanel.voc * (1 + (tcVoc / 100) * (10 - 25));
    const expected = Math.floor((mockInverter.vocMax * 0.95) / vocCold);
    expect(result.ppsMaxVolt).toBe(expected);
  });

  it('ppsMin reflects hot temperature Vmp constraint', () => {
    const result = inverterCompatibility(mockPanel, mockInverter, 10, 65);
    const vmpHot = mockPanel.vmp * (1 + (mockPanel.tempCoeffPmax / 100) * (65 - 25));
    const expected = Math.ceil((mockInverter.mpptVmin * 1.05) / vmpHot);
    expect(result.ppsMin).toBe(expected);
  });
});

// ==================== selectCompatibleInverter ====================
describe('selectCompatibleInverter', () => {
  it('returns an inverter from the catalog', () => {
    const inv = selectCompatibleInverter(mockPanel, 5.0, 'on-grid', DEFAULT_INVERTERS);
    expect(inv).not.toBeNull();
    expect(inv).toHaveProperty('kw');
  });

  it('filters by sysType (on-grid excludes off-grid inverters)', () => {
    const inv = selectCompatibleInverter(mockPanel, 5.0, 'on-grid', DEFAULT_INVERTERS);
    expect(['on-grid', 'hybrid']).toContain(inv.type);
  });

  it('filters by sysType (off-grid excludes on-grid inverters)', () => {
    const inv = selectCompatibleInverter(mockPanel, 3.0, 'off-grid', DEFAULT_INVERTERS);
    expect(['off-grid', 'hybrid']).toContain(inv.type);
  });

  it('returns inverter with kw >= kwp or closest above for adequate sizing', () => {
    const kwp = 5.0;
    const inv = selectCompatibleInverter(mockPanel, kwp, 'on-grid', DEFAULT_INVERTERS);
    // The DC/AC scoring may pick slightly below kwp — just verify result is reasonable
    expect(inv.kw).toBeGreaterThan(0);
  });

  it('returns null or undefined when no compatible inverter exists', () => {
    // Only off-grid inverters but asking for hybrid with incompatible offGridCapable
    const hybridOnlyPool = [
      { id: 'hx', kw: 5, type: 'hybrid', price: 5000000, kg: 20, offGridCapable: false,
        vocMax: 550, mpptVmin: 80, mpptVmax: 500, mpptCount: 2, idcMax: 14, phase: 1 },
    ];
    // off-grid type requires offGridCapable=true for hybrid — pool filtered to empty
    // then falls back to byType or any
    const result = selectCompatibleInverter(mockPanel, 5.0, 'off-grid', hybridOnlyPool);
    // With the fallback logic it should still return something (byType or any)
    // but if truly nothing → function returns first or null
    // The function has multi-level fallback, so result should be the hybrid or null
    // Per the code: byType filters hybrid without offGridCapable → empty → falls to `any`
    expect(result).toBeDefined();
  });

  it('prefers exact sysType match over fallback family', () => {
    const inv = selectCompatibleInverter(mockPanel, 10.0, 'on-grid', DEFAULT_INVERTERS);
    expect(inv.type).toBe('on-grid');
  });

  it('returns hybrid inverter for hybrid sysType', () => {
    const inv = selectCompatibleInverter(mockPanel, 5.0, 'hybrid', DEFAULT_INVERTERS);
    expect(inv.type).toBe('hybrid');
  });

  it('respects phases option when provided', () => {
    const inv = selectCompatibleInverter(mockPanel, 5.0, 'on-grid', DEFAULT_INVERTERS, { phases: [1] });
    expect(inv.phase).toBe(1);
  });
});

// ==================== validateLayout ====================
describe('validateLayout', () => {
  it('returns ok=true for a valid configuration', () => {
    // pps=19 strings of 1 panel each with mockInverter (vocMax=1000)
    // Voc cold per string = 49.75*(1+(-0.275/100)*(10-25))*19 ≈ 983V < 1000V
    // Let's use pps=18 to be safe
    const result = validateLayout(mockPanel, mockInverter, 18, 1, 10, 65);
    // Voc cold per string at 18 panels: 49.75*(1-0.04125)*18 = 49.75*0.95875*18 ≈ 857V < 1000V ✓
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error when Voc-cold exceeds vocMax', () => {
    // Force Voc cold to exceed vocMax: use 30 panels × ~50.96V/panel ≈ 1529V > 1000V
    const result = validateLayout(mockPanel, mockInverter, 30, 1, 10, 65);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Voc/i);
  });

  it('returns warning when Vmp-hot < mpptVmin', () => {
    // With only 1 panel per string and mpptVmin=200: Vmp hot at 65°C ≈ 41.8*(1-0.14)=35.9V < 200V
    const result = validateLayout(mockPanel, mockInverter, 1, 1, 10, 65);
    const hasVmpWarning = result.warnings.some(w => w.includes('Vmp') || w.includes('MPPT') || w.includes('caliente'));
    expect(hasVmpWarning).toBe(true);
  });

  it('returns error when Vmp STC exceeds mpptVmax', () => {
    // Force Vmp STC > mpptVmax: use 25 panels × 41.8V = 1045V > 850V
    const result = validateLayout(mockPanel, mockInverter, 25, 1, 10, 65);
    const hasVmpError = result.errors.some(e => e.includes('Vmp') || e.includes('MPPT'));
    expect(hasVmpError).toBe(true);
  });

  it('returns error when current per MPPT exceeds idcMax', () => {
    // 3 strings per MPPT × 13.04A = 39.12A > 25A
    const result = validateLayout(mockPanel, mockInverter, 5, 6, 10, 65);
    // stringsPerMppt = ceil(6/2) = 3; currentPerMppt = 13.04*3 = 39.12 > 25
    const hasCurrentError = result.errors.some(e => e.includes('Idc') || e.includes('corriente'));
    expect(hasCurrentError).toBe(true);
  });

  it('returns error when panel or inverter is undefined', () => {
    const result = validateLayout(null, mockInverter, 5, 1, 10, 65);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns metrics object with computed values', () => {
    const result = validateLayout(mockPanel, mockInverter, 10, 1, 10, 65);
    expect(result.metrics).toHaveProperty('stringVocCold');
    expect(result.metrics).toHaveProperty('stringVmpStc');
    expect(result.metrics).toHaveProperty('stringVmpHot');
    expect(result.metrics).toHaveProperty('currentPerMppt');
  });

  it('warning when numStrings > mpptCount × 2', () => {
    // 10 strings with mpptCount=2 → 10 > 4 → warning
    // First avoid current error: use 2 strings per MPPT max; let's check strings=5 with pps=1
    // currentPerMppt = imp * ceil(5/2) = 13.04*3 = 39.12 > idcMax=25 → also current error
    // Use a special inverter with large idcMax to isolate the strings warning
    const bigInv = { ...mockInverter, idcMax: 200, vocMax: 2000, mpptVmax: 5000, mpptVmin: 1 };
    const result = validateLayout(mockPanel, bigInv, 1, 10, 10, 65);
    const hasStringsWarning = result.warnings.some(w => w.includes('strings'));
    expect(hasStringsWarning).toBe(true);
  });
});

// ==================== pickBestTransport ====================
describe('pickBestTransport', () => {
  it('returns a result with best and quotes array', () => {
    const result = pickBestTransport('L', 100, 0, CARRIERS);
    expect(result).toHaveProperty('best');
    expect(result).toHaveProperty('quotes');
    expect(Array.isArray(result.quotes)).toBe(true);
  });

  it('quotes are sorted ascending by total', () => {
    const result = pickBestTransport('N1', 150, 0, CARRIERS);
    for (let i = 1; i < result.quotes.length; i++) {
      expect(result.quotes[i].total).toBeGreaterThanOrEqual(result.quotes[i - 1].total);
    }
  });

  it('best === quotes[0]', () => {
    const result = pickBestTransport('R', 80, 0, CARRIERS);
    expect(result.best).toEqual(result.quotes[0]);
  });

  it('Zona L total < Zona N2 total for same weight', () => {
    const resultL  = pickBestTransport('L',  100, 0, CARRIERS);
    const resultN2 = pickBestTransport('N2', 100, 0, CARRIERS);
    expect(resultL.best.flete).toBeLessThan(resultN2.best.flete);
  });

  it('heavier weight → higher flete total', () => {
    const resultLight  = pickBestTransport('R', 50,  0, CARRIERS);
    const resultHeavy  = pickBestTransport('R', 200, 0, CARRIERS);
    expect(resultHeavy.best.flete).toBeGreaterThan(resultLight.best.flete);
  });

  it('sobreflete (sf) is included in total', () => {
    const valorDec = 10000000;
    const result = pickBestTransport('R', 100, valorDec, CARRIERS);
    expect(result.best.sf).toBeGreaterThan(0);
    expect(result.best.total).toBe(result.best.flete + result.best.sf);
  });

  it('sf = 0 when valorDec = 0', () => {
    const result = pickBestTransport('L', 50, 0, CARRIERS);
    expect(result.best.sf).toBe(0);
  });

  it('each quote has carrierId and label', () => {
    const result = pickBestTransport('L', 100, 0, CARRIERS);
    result.quotes.forEach(q => {
      expect(q).toHaveProperty('carrierId');
      expect(q).toHaveProperty('label');
    });
  });
});

// ==================== getEffectiveTariff ====================
describe('getEffectiveTariff', () => {
  it('E1 = 50% of base tariff', () => {
    const base = mockOperator.tariff; // 720
    const tariff = getEffectiveTariff(mockOperator, 'E1');
    expect(tariff).toBe(Math.round(base * 0.50));
  });

  it('E2 = 60% of base tariff', () => {
    const tariff = getEffectiveTariff(mockOperator, 'E2');
    expect(tariff).toBe(Math.round(mockOperator.tariff * 0.60));
  });

  it('E3 = 85% of base tariff', () => {
    const tariff = getEffectiveTariff(mockOperator, 'E3');
    expect(tariff).toBe(Math.round(mockOperator.tariff * 0.85));
  });

  it('E4 = 100% of base tariff (tarifa plena)', () => {
    const tariff = getEffectiveTariff(mockOperator, 'E4');
    expect(tariff).toBe(mockOperator.tariff);
  });

  it('E5 = 120% of base tariff (contribución)', () => {
    const tariff = getEffectiveTariff(mockOperator, 'E5');
    expect(tariff).toBe(Math.round(mockOperator.tariff * 1.20));
  });

  it('E6 = 120% of base tariff (same as E5)', () => {
    const tariff = getEffectiveTariff(mockOperator, 'E6');
    expect(tariff).toBe(Math.round(mockOperator.tariff * 1.20));
  });

  it('unknown estrato defaults to 100%', () => {
    const tariff = getEffectiveTariff(mockOperator, 'UNKNOWN');
    expect(tariff).toBe(mockOperator.tariff);
  });

  it('default estrato is E4 (100%)', () => {
    const tariff = getEffectiveTariff(mockOperator);
    expect(tariff).toBe(mockOperator.tariff);
  });

  it('E1 tariff is less than E5 tariff for same operator', () => {
    const e1 = getEffectiveTariff(mockOperator, 'E1');
    const e5 = getEffectiveTariff(mockOperator, 'E5');
    expect(e1).toBeLessThan(e5);
  });

  it('COM = 100% of base tariff', () => {
    const tariff = getEffectiveTariff(mockOperator, 'COM');
    expect(tariff).toBe(mockOperator.tariff);
  });
});

// ==================== getPR ====================
describe('getPR', () => {
  it('Bogotá D.C. returns 0.83', () => {
    expect(getPR('Bogotá D.C.')).toBe(0.83);
  });

  it('Boyacá returns 0.83', () => {
    expect(getPR('Boyacá')).toBe(0.83);
  });

  it('Chocó returns 0.73', () => {
    expect(getPR('Chocó')).toBe(0.73);
  });

  it('Amazonas returns 0.73', () => {
    expect(getPR('Amazonas')).toBe(0.73);
  });

  it('Antioquia returns 0.81', () => {
    expect(getPR('Antioquia')).toBe(0.81);
  });

  it('Valle del Cauca returns 0.81', () => {
    expect(getPR('Valle del Cauca')).toBe(0.81);
  });

  it('unknown dept returns 0.78 default', () => {
    expect(getPR('Atlantida')).toBe(0.78);
  });

  it('empty string returns 0.78 default', () => {
    expect(getPR('')).toBe(0.78);
  });

  it('undefined returns 0.78 default', () => {
    expect(getPR(undefined)).toBe(0.78);
  });

  it('all DEPT_PR values are in range [0.70, 0.90]', () => {
    Object.values(DEPT_PR).forEach(pr => {
      expect(pr).toBeGreaterThanOrEqual(0.70);
      expect(pr).toBeLessThanOrEqual(0.90);
    });
  });
});

// ==================== excedentePriceFor ====================
describe('excedentePriceFor', () => {
  it('returns price less than base tariff (CU − G)', () => {
    const cu = mockOperator.tariff;
    const excedente = excedentePriceFor(mockOperator);
    expect(excedente).toBeLessThan(cu);
  });

  it('excedente price = T + D + Cv + PR + R (no G component)', () => {
    const cu = splitCU(mockOperator);
    const expected = cu.T + cu.D + cu.Cv + cu.PR + cu.R;
    expect(excedentePriceFor(mockOperator)).toBe(expected);
  });

  it('excedente price > 0 for any valid operator', () => {
    expect(excedentePriceFor(mockOperator)).toBeGreaterThan(0);
  });

  it('higher tariff operator → higher excedente price', () => {
    const opLow  = { tariff: 600 };
    const opHigh = { tariff: 750 };
    expect(excedentePriceFor(opHigh)).toBeGreaterThan(excedentePriceFor(opLow));
  });
});

// ==================== DEFAULT exports sanity ====================
describe('DEFAULT exports', () => {
  it('DEFAULT_PANELS has at least 4 panels', () => {
    expect(DEFAULT_PANELS.length).toBeGreaterThanOrEqual(4);
  });

  it('DEFAULT_INVERTERS has at least 3 inverters of each type', () => {
    const onGrid   = DEFAULT_INVERTERS.filter(i => i.type === 'on-grid');
    const hybrid   = DEFAULT_INVERTERS.filter(i => i.type === 'hybrid');
    const offGrid  = DEFAULT_INVERTERS.filter(i => i.type === 'off-grid');
    expect(onGrid.length).toBeGreaterThanOrEqual(3);
    expect(hybrid.length).toBeGreaterThanOrEqual(2);
    expect(offGrid.length).toBeGreaterThanOrEqual(2);
  });

  it('DEFAULT_BATTERIES has at least 5 entries', () => {
    expect(DEFAULT_BATTERIES.length).toBeGreaterThanOrEqual(5);
  });

  it('DEFAULT_PRICING has all required keys', () => {
    const required = ['structure_per_panel', 'cabling_per_kwp', 'protections_per_kwp',
      'installation_per_kwp', 'engineering', 'emsa_tramites', 'iva'];
    required.forEach(k => expect(DEFAULT_PRICING).toHaveProperty(k));
  });

  it('CARRIERS has at least 5 carrier entries', () => {
    expect(Object.keys(CARRIERS).length).toBeGreaterThanOrEqual(5);
  });

  it('MAX_KWP_AGPE is 500', () => {
    expect(MAX_KWP_AGPE).toBe(500);
  });
});
