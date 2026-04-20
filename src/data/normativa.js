// Marco regulatorio colombiano aplicable al cotizador AGPE/GD.
// Referencias oficiales — se muestran al cliente para aterrizar la
// propuesta en la legislación vigente (no reemplazan asesoría jurídica).
//
// scope: cuándo aplica esta norma al caso del cliente.
//   - 'always'        → siempre aplica (base legal / medición)
//   - 'agpe'          → aplica a todo AGPE (Menor o Mayor)
//   - 'agpe-menor'    → sólo AGPE Menor (≤ 100 kWp)
//   - 'agpe-mayor'    → sólo AGPE Mayor (100 kWp – 1 MW)
//   - 'excedentes'    → cuando el sistema entrega excedentes a la red
//   - 'comunidad'     → sólo esquemas colectivos (no cubierto en el cotizador v1)
//   - 'remoto'        → autogeneración remota / productor marginal remoto
//   - 'off-grid'      → sistema aislado (no conectado al SIN)

export const NORMATIVA = [
  {
    id: 'Ley 1715/2014',
    title: 'Ley 1715 de 2014',
    fullName: 'Ley de Fomento FNCE y Gestión Eficiente de la Energía',
    article: 'Art. 8 y siguientes',
    scope: 'always',
    summary:
      'Base legal de la autogeneración con FNCER. Autoriza a autogeneradores (pequeña y gran escala) a entregar excedentes a la red y faculta a la CREG para regular conexión, medición, operación y remuneración mediante crédito de energía con medición bidireccional.',
  },
  {
    id: 'Decreto 1073/2015',
    title: 'Decreto 1073 de 2015',
    fullName: 'Decreto Único Reglamentario del Sector Administrativo de Minas y Energía',
    article: 'Sección 4, Capítulo 2, Título III — modificado por Decreto 1403/2024 y Decreto 376/2026',
    scope: 'always',
    summary:
      'Política energética del MinMinas sobre entrega de excedentes. Define simetría con generadores del mercado mayorista, parámetros para ser AGPE, trámite simplificado de conexión al OR, contrato de respaldo (obligatorio gran escala, opcional ≤0,1 MW) y créditos de energía para FNCER. El Decreto 1403/2024 habilita autogeneración remota y producción marginal.',
  },
  {
    id: 'CREG 174/2021',
    title: 'Resolución CREG 174 de 2021',
    fullName: 'Mecanismos y requisitos para conexión, medición y remuneración de AGPE y GD al SIN',
    article: 'Deroga Res. CREG 030/2018',
    scope: 'agpe',
    summary:
      'Norma central operativa y comercial para AGPE y Generadores Distribuidos en el SIN. Regula el procedimiento simplificado de conexión al Operador de Red, requisitos técnicos y plazos, medición y liquidación de excedentes, alternativas de comercialización, y la remuneración: crédito de energía para FNCER (AGPE Menor, netting 1:1) o pago a precio de bolsa (AGPE Mayor). Aplica a usuarios domiciliarios, comerciales e industriales.',
  },
  {
    id: 'CREG 135/2021',
    title: 'Resolución CREG 135 de 2021',
    fullName: 'Derechos y deberes de autogeneradores que entregan o venden excedentes',
    scope: 'excedentes',
    summary:
      'Obliga al autogenerador a suscribir un acuerdo especial (anexo al Contrato de Condiciones Uniformes) con el comercializador antes de entregar energía. Define protecciones al usuario, obligaciones de liquidación periódica del comercializador y consecuencias del incumplimiento (excedentes no remunerados).',
  },
  {
    id: 'CREG 038/2014',
    title: 'Resolución CREG 038 de 2014',
    fullName: 'Código de Medida',
    article: 'Modificada por Res. CREG 101 072/2025 en aspectos de comunidades',
    scope: 'always',
    summary:
      'Medición bidireccional obligatoria. Requisitos técnicos para medidores que registren importación y exportación de energía — esencial para cuantificar excedentes.',
  },
  {
    id: 'CREG 101 072/2025',
    title: 'Resolución CREG 101 072 de 2025',
    fullName: 'Comunidades Energéticas y remuneración de excedentes colectivos',
    scope: 'comunidad',
    summary:
      'Armoniza la regulación para Autogeneración Colectiva (AGRC) y Generación Distribuida Colectiva. Regula entrega y liquidación de excedentes en esquemas colectivos y facilita integración al SDL/SIN.',
  },
  {
    id: 'CREG 101 099/2026',
    title: 'Resolución CREG 101 099 de 2026',
    fullName: 'Autogeneración remota y productor marginal remoto',
    scope: 'remoto',
    summary:
      'Regula entrega de excedentes en esquemas remotos (generación en un sitio y consumo en otro). Aplica simetría con generadores convencionales para conexión y participación en el mercado mayorista cuando hay excedentes.',
  },
  {
    id: 'Ley 855/2003',
    title: 'Ley 855 de 2003 + CREG 091/2007',
    fullName: 'Zonas No Interconectadas (ZNI) y prestación del servicio en sistemas aislados',
    scope: 'off-grid',
    summary:
      'Marco para soluciones de energía en Zonas No Interconectadas (ZNI) y sistemas aislados. Los sistemas off-grid no entregan excedentes al SIN porque no están conectados — la energía sobrante se pierde o se limita vía dump load. El IPSE gestiona subsidios y planes de expansión rural. RETIE aplica en todo caso para la instalación.',
  },
];

// Devuelve el subconjunto de normas aplicables al caso del cliente.
// ctx: { hasExcedentes: bool, agpeCategory, kwp, gridExport }
export function getApplicableNormativa(ctx = {}) {
  const { hasExcedentes = false, agpeCategory, gridExport = true } = ctx;
  return NORMATIVA.filter(n => {
    if (n.scope === 'off-grid') return !gridExport;
    if (!gridExport) return false; // off-grid: sólo ZNI + RETIE, el resto no aplica
    if (n.scope === 'always') return true;
    if (n.scope === 'agpe') return true;
    if (n.scope === 'agpe-menor') return agpeCategory === 'Menor';
    if (n.scope === 'agpe-mayor') return agpeCategory === 'Mayor';
    if (n.scope === 'excedentes') return hasExcedentes;
    // 'comunidad' y 'remoto' no se muestran en el cotizador individual.
    return false;
  });
}
