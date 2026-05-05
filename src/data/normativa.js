// Marco regulatorio colombiano aplicable al cotizador AGPE/GD.
// Referencias oficiales — se muestran al cliente para aterrizar la
// propuesta en la legislación vigente (no reemplazan asesoría jurídica).
//
// scope: cuándo aplica esta norma al caso del cliente.
//   'always'      → toda instalación solar (base legal)
//   'grid'        → cualquier sistema conectado al SIN (on-grid, híbrido)
//   'agpe'        → AGPE conectado al SIN (con o sin excedentes)
//   'agpe-menor'  → AGPE Menor (≤ 100 kWp)
//   'agpe-mayor'  → AGPE Mayor (100 kWp – 1 MW)
//   'excedentes'  → cuando el sistema entrega excedentes a la red
//   'off-grid'    → sistema aislado, no conectado al SIN
//
// category:
//   'required'  → directamente aplicable a esta instalación
//   'suggested' → puede ser de interés; se muestra aparte como "Puede interesarte"

export const NORMATIVA = [
  {
    id: 'Ley 1715/2014',
    title: 'Ley 1715 de 2014',
    fullName: 'Ley de Fomento a las FNCER y Gestión Eficiente de la Energía',
    article: 'Art. 8 y siguientes',
    scope: 'always',
    category: 'required',
    summary:
      'Base legal de toda autogeneración solar en Colombia. Autoriza a pequeños y grandes autogeneradores a instalar sistemas FNCER, y los faculta para conectarse a la red, generar y — si lo desean — entregar excedentes. Habilita los incentivos tributarios (IVA, aranceles) y las deducciones de renta aplicables a proyectos de energías renovables.',
  },
  {
    id: 'CREG 174/2021',
    title: 'Resolución CREG 174 de 2021',
    fullName: 'Conexión, medición y remuneración de AGPE y Generadores Distribuidos al SIN',
    article: 'Deroga Res. CREG 030/2018',
    scope: 'agpe',
    category: 'required',
    summary:
      'Norma operativa central para todo sistema AGPE conectado al SIN. Regula el procedimiento simplificado de conexión al Operador de Red ({OR}), los requisitos técnicos de protección (anti-isla), plazos de aprobación y — cuando se entregan excedentes — la liquidación y remuneración: crédito de energía 1:1 para AGPE Menor o precio de bolsa para AGPE Mayor.',
  },
  {
    id: 'CREG 038/2014',
    title: 'Resolución CREG 038 de 2014',
    fullName: 'Código de Medida',
    article: 'Modificada por Res. CREG 101 072/2025 en aspectos de comunidades',
    scope: 'grid',
    category: 'required',
    summary:
      'Medición bidireccional obligatoria para todo sistema conectado al SIN. Establece los requisitos técnicos del medidor que debe registrar tanto la energía importada de la red como la exportada hacia ella. El OR (Operador de Red) instala o homologa el equipo de medida.',
  },
  {
    id: 'Decreto 1073/2015',
    title: 'Decreto 1073 de 2015',
    fullName: 'Decreto Único Reglamentario del Sector de Minas y Energía',
    article: 'Sección 4, Cap. 2, Título III — mod. Decreto 1403/2024 y Decreto 376/2026',
    scope: 'excedentes',
    category: 'required',
    summary:
      'Política del MinMinas para la entrega de excedentes al SIN. Define los parámetros para ser AGPE, el trámite simplificado de conexión al OR, las opciones de comercialización (crédito de energía o contrato directo), y los créditos de energía para FNCER. El Decreto 1403/2024 incorporó la autogeneración remota y el productor marginal remoto.',
  },
  {
    id: 'CREG 135/2021',
    title: 'Resolución CREG 135 de 2021',
    fullName: 'Derechos y deberes de autogeneradores que entregan o venden excedentes',
    scope: 'excedentes',
    category: 'required',
    summary:
      'Antes de entregar excedentes, el autogenerador debe suscribir un acuerdo especial (anexo al Contrato de Condiciones Uniformes) con su comercializador. Define las obligaciones de liquidación periódica, los derechos del usuario (crédito o pago de excedentes) y las consecuencias del incumplimiento por parte del comercializador.',
  },
  {
    id: 'CREG 101 072/2025',
    title: 'Resolución CREG 101 072 de 2025',
    fullName: 'Comunidades Energéticas y remuneración de excedentes colectivos',
    scope: 'excedentes',
    category: 'suggested',
    summary:
      'Si en el futuro planeas compartir tu sistema con otros usuarios del mismo predio, edificio o conjunto (autogeneración colectiva — AGRC), esta resolución habilita la Comunidad Energética con distribución de excedentes entre participantes. Aplica cuando varios usuarios se asocian bajo un único punto de conexión con reparto interno de la generación y los ahorros.',
  },
  {
    id: 'CREG 101 099/2026',
    title: 'Resolución CREG 101 099 de 2026',
    fullName: 'Autogeneración remota y productor marginal remoto',
    scope: 'excedentes',
    category: 'suggested',
    summary:
      'Permite generar energía en un predio distinto al de consumo y descontar esa producción en la factura de otra sede (autogeneración remota). Útil si tienes paneles en una bodega, lote o finca y quieres aplicar esa energía en una sede o local diferente. Los excedentes remotos se valoran con simetría frente a generadores convencionales del mercado mayorista.',
  },
  {
    id: 'Ley 855/2003',
    title: 'Ley 855 de 2003 + CREG 091/2007',
    fullName: 'Zonas No Interconectadas (ZNI) y prestación del servicio en sistemas aislados',
    scope: 'off-grid',
    category: 'required',
    summary:
      'Marco para energía en Zonas No Interconectadas (ZNI) y sistemas aislados. Los sistemas off-grid no están conectados al SIN: la energía sobrante se limita con dump load o regulador de carga — no se puede entregar a la red. El IPSE gestiona subsidios y planes de expansión rural en ZNI. RETIE aplica en todo caso para la instalación eléctrica.',
  },
];

// Devuelve el subconjunto de normas aplicables al caso del cliente.
// ctx: { hasExcedentes, agpeCategory, kwp, gridExport }
// Retorna norms con .category 'required' y 'suggested'.
// El caller puede filtrar por .category si quiere mostrarlos separados.
export function getApplicableNormativa(ctx = {}) {
  const { hasExcedentes = false, agpeCategory, gridExport = true } = ctx;
  return NORMATIVA.filter(n => {
    // Off-grid: solo la norma ZNI. Todo lo demás no aplica.
    if (n.scope === 'off-grid') return !gridExport;
    if (!gridExport) return false;
    // On-grid / híbrido:
    if (n.scope === 'always') return true;
    if (n.scope === 'grid') return true;
    if (n.scope === 'agpe') return true;
    if (n.scope === 'agpe-menor') return agpeCategory === 'Menor';
    if (n.scope === 'agpe-mayor') return agpeCategory === 'Mayor';
    // Excedentes: norms required + suggested solo cuando hay entrega de energía.
    if (n.scope === 'excedentes') return hasExcedentes;
    return false;
  });
}
