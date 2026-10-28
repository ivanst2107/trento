// Parses a bank statement exported as CSV into movements.
// Accepts the common Mexican layouts: separate Cargo/Abono columns or a single signed
// Monto/Importe column, comma/semicolon/tab separators, dd/mm/yyyy or ISO dates.

const MONTHS = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };

export const normalize = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

function splitRows(text, sep) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export function parseAmount(raw) {
  let s = String(raw ?? '').replace(/[$\s]/g, '');
  if (!s) return 0;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()\-+]/g, '');
  // "1.234,56" -> decimal comma; otherwise commas are thousands separators.
  if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.') && /,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Importe no válido: "${raw}"`);
  return negative ? -n : n;
}

export function parseDate(raw) {
  const s = normalize(raw);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) return iso(year(m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[/\-. ]([A-Z]{3})[A-Z]*[/\-. ](\d{2,4})$/);
  if (m && MONTHS[m[2]]) return iso(year(m[3]), MONTHS[m[2]], +m[1]);
  throw new Error(`Fecha no reconocida: "${raw}"`);
}

const year = (y) => (y.length === 2 ? 2000 + +y : +y);
function iso(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new Error(`Fecha no válida: ${d}/${mo}/${y}`);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const COLUMN_ALIASES = {
  fecha: ['FECHA', 'FECHA OPERACION', 'FECHA DE OPERACION', 'DIA'],
  descripcion: ['DESCRIPCION', 'CONCEPTO', 'DETALLE', 'MOVIMIENTO'],
  referencia: ['REFERENCIA', 'REF', 'REFERENCIA NUMERICA', 'FOLIO'],
  cargo: ['CARGO', 'CARGOS', 'RETIRO', 'RETIROS', 'DEBITO'],
  abono: ['ABONO', 'ABONOS', 'DEPOSITO', 'DEPOSITOS', 'CREDITO'],
  monto: ['MONTO', 'IMPORTE'],
};

export function parseBankCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = [';', '\t', ','].reduce((best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best), ',');
  const rows = splitRows(text, sep);
  if (rows.length < 2) throw new Error('El estado de cuenta está vacío');

  const header = rows[0].map(normalize);
  const col = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = header.findIndex((h) => aliases.includes(h));
    if (idx >= 0) col[key] = idx;
  }
  if (col.fecha == null || col.descripcion == null) throw new Error('El CSV necesita columnas "Fecha" y "Descripción"');
  if (col.monto == null && col.cargo == null && col.abono == null) throw new Error('El CSV necesita columnas "Cargo"/"Abono" o "Monto"');

  const movements = [];
  const warnings = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    try {
      let amount;
      if (col.monto != null) amount = parseAmount(r[col.monto]);
      else amount = parseAmount(r[col.abono]) - Math.abs(parseAmount(r[col.cargo]));
      if (amount === 0) return;
      movements.push({
        id: `M${String(movements.length + 1).padStart(3, '0')}`,
        linea: line,
        fecha: parseDate(r[col.fecha]),
        descripcion: (r[col.descripcion] || '').trim(),
        referencia: col.referencia != null ? (r[col.referencia] || '').trim() : '',
        tipo: amount > 0 ? 'abono' : 'cargo',
        monto: Math.round(Math.abs(amount) * 100) / 100,
      });
    } catch (e) {
      warnings.push(`Línea ${line}: ${e.message}`);
    }
  });
  return { movements, warnings };
}
