// SAT list of art. 69-B CFF (EFOS): taxpayers presumed or confirmed to invoice simulated
// operations. Parses the layout of the official "Listado_Completo_69-B.csv" and flags the
// CFDI the company received from suppliers that are still presumed or already definitive.

const RISK = {
  DEFINITIVO: {
    riesgo: 'alto',
    accion: 'Sus CFDI no tienen efectos fiscales: no deducir ni acreditar el IVA, o demostrar que la operación fue real (art. 69-B CFF).',
  },
  PRESUNTO: {
    riesgo: 'medio',
    accion: 'El proveedor está en aclaración ante el SAT: documentar que la operación fue real y vigilar su situación.',
  },
};

// Minimal RFC-4180 reader: quoted fields may hold commas, quotes ("") and line breaks.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const situacionKey = (s) => s.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Returns Map RFC -> { nombre, situacion } from the SAT CSV (title lines before the header are skipped).
export function parseEfosCsv(text) {
  const rows = parseCsv(text);
  const header = rows.findIndex((r) => r[1]?.trim().toUpperCase() === 'RFC');
  if (header < 0) throw new Error('No se encontró la columna RFC del listado 69-B');
  const col = rows[header].findIndex((h) => situacionKey(h).startsWith('SITUACION'));
  const list = new Map();
  for (const r of rows.slice(header + 1)) {
    const rfc = r[1]?.trim().toUpperCase();
    if (rfc) list.set(rfc, { nombre: r[2]?.trim() || '', situacion: r[col]?.trim() || '' });
  }
  return list;
}

// Received invoices (tipo I) whose issuer is presumed or definitive on the list.
// `paid` = set of CFDI UUIDs already matched to a bank payment.
export function checkEfos({ cfdis, companyRfc, list, paid = new Set() }) {
  const hits = [];
  for (const c of cfdis) {
    if (c.tipo !== 'I' || c.receptor.rfc !== companyRfc) continue;
    const entry = list.get(c.emisor.rfc);
    const risk = entry && RISK[situacionKey(entry.situacion)];
    if (!risk) continue;
    hits.push({ cfdi: c, situacion: entry.situacion, ...risk, pagado: paid.has(c.uuid) });
  }
  const order = { alto: 0, medio: 1 };
  hits.sort((a, b) => order[a.riesgo] - order[b.riesgo] || a.cfdi.fecha.localeCompare(b.cfdi.fecha));
  return {
    hits,
    proveedores: new Set(hits.map((h) => h.cfdi.emisor.rfc)).size,
    ivaEnRiesgo: Math.round(hits.reduce((s, h) => s + h.cfdi.iva, 0) * 100) / 100,
  };
}
