// Bank-statement vs CFDI reconciliation and draft journal entries (pólizas).
// A match needs the right direction (cobro/pago), the amount within tolerance and a
// plausible date; the bank description (RFC, folio, UUID, counterparty name) breaks ties.

import { normalize } from './bank.js';

// SAT código agrupador (Anexo 24). Drafts only: the client's own chart of accounts applies.
export const ACCOUNTS = {
  bancos: ['102.01', 'Bancos nacionales'],
  clientes: ['105.01', 'Clientes nacionales'],
  ivaAcreditablePagado: ['118.01', 'IVA acreditable pagado'],
  ivaPendientePago: ['119.01', 'IVA pendiente de pago'],
  proveedores: ['201.01', 'Proveedores nacionales'],
  ivaTrasladadoCobrado: ['208.01', 'IVA trasladado cobrado'],
  ivaTrasladadoNoCobrado: ['209.01', 'IVA trasladado no cobrado'],
  gastosFinancieros: ['701', 'Gastos financieros (comisiones bancarias)'],
  porAclarar: ['—', 'Diferencia por aclarar'],
};

export const DEFAULTS = { tolerance: 1, maxDaysBefore: 3, maxDaysAfter: 60, minScore: 55 };

const STOP = new Set(['SA', 'DE', 'CV', 'SAPI', 'SC', 'RL', 'SRL', 'LA', 'EL', 'DEL', 'LOS', 'LAS', 'MEXICO', 'GRUPO', 'COMPANIA']);

const round2 = (n) => Math.round(n * 100) / 100;
const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const compact = (s) => normalize(s).replace(/[^A-Z0-9]/g, '');
export const cfdiLabel = (c) => (c.serie || c.folio ? [c.serie, c.folio].filter(Boolean).join('-') : c.uuid.slice(0, 8));

// The company is the RFC that appears on the most CFDIs, as issuer or receiver.
export function detectCompanyRfc(cfdis) {
  const counts = new Map();
  for (const c of cfdis) {
    for (const rfc of new Set([c.emisor.rfc, c.receptor.rfc])) counts.set(rfc, (counts.get(rfc) || 0) + 1);
  }
  let best = '';
  for (const [rfc, n] of counts) if (rfc && n > (counts.get(best) || 0)) best = rfc;
  return best;
}

function buildItems(cfdis, rfc) {
  const byUuid = new Map(cfdis.map((c) => [c.uuid, c]));
  const coveredByPago = new Set();
  for (const c of cfdis) for (const p of c.pagos) for (const d of p.docs) coveredByPago.add(d.uuid);

  const items = [];
  const excluded = [];
  for (const c of cfdis) {
    const issued = c.emisor.rfc === rfc;
    if (!issued && c.receptor.rfc !== rfc) {
      excluded.push({ cfdi: c, motivo: 'No corresponde al RFC de la empresa' });
      continue;
    }
    const base = { cfdi: c, direction: issued ? 'abono' : 'cargo', counterparty: issued ? c.receptor : c.emisor };

    if (c.tipo === 'I') {
      if (c.metodoPago === 'PPD' && coveredByPago.has(c.uuid)) {
        excluded.push({ cfdi: c, motivo: 'PPD: se concilia a través de su complemento de pago' });
        continue;
      }
      const fx = c.moneda === 'MXN' ? 1 : c.tipoCambio;
      items.push({
        ...base, key: c.uuid, kind: 'factura', fecha: c.fecha, label: cfdiLabel(c), refs: [cfdiLabel(c)],
        amount: round2(c.total * fx), iva: round2(c.iva * fx), foreign: c.moneda !== 'MXN',
      });
    } else if (c.tipo === 'P') {
      c.pagos.forEach((p, i) => {
        const related = p.docs.map((d) => byUuid.get(d.uuid));
        // Pagos 1.0 carries no tax breakdown: prorate the related invoices' IVA.
        const iva = p.iva || p.docs.reduce((s, d, j) => s + (related[j]?.total ? (related[j].iva * d.impPagado) / related[j].total : 0), 0);
        const fx = p.moneda === 'MXN' ? 1 : p.tipoCambio;
        const relLabels = p.docs.map((d, j) => (related[j] ? cfdiLabel(related[j]) : d.uuid.slice(0, 8)));
        items.push({
          ...base, key: `${c.uuid}#${i + 1}`, kind: 'pago', pago: p, fecha: p.fecha,
          label: `REP ${cfdiLabel(c)}`, refs: [cfdiLabel(c), ...relLabels], relacionados: relLabels,
          amount: round2(p.monto * fx), iva: round2(iva * fx), foreign: p.moneda !== 'MXN',
        });
      });
    } else if (c.tipo === 'E') {
      excluded.push({ cfdi: c, motivo: 'Nota de crédito: no genera movimiento bancario directo' });
    } else {
      excluded.push({ cfdi: c, motivo: `Tipo ${c.tipo}: no se concilia contra bancos` });
    }
  }
  return { items, excluded };
}

function textScore(mov, counterparty, refs = [], uuid = '') {
  const hay = normalize(`${mov.descripcion} ${mov.referencia}`);
  const flat = hay.replace(/[^A-Z0-9]/g, '');
  if (counterparty.rfc && flat.includes(counterparty.rfc)) return 15;
  if (refs.some((r) => compact(r).length >= 4 && flat.includes(compact(r)))) return 15;
  if (uuid && flat.includes(uuid.replace(/-/g, '').slice(0, 8))) return 15;
  const words = normalize(counterparty.nombre).split(/[^A-Z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));
  const hits = words.filter((w) => new RegExp(`\\b${w}\\b`).test(hay)).length;
  if (!hits) return 0;
  return hits >= 2 || hits === words.length ? 12 : 8;
}

function scorePair(mov, item, opt) {
  if (mov.tipo !== item.direction) return null;
  const tol = item.foreign ? Math.max(opt.tolerance, item.amount * 0.015) : opt.tolerance;
  const diff = round2(mov.monto - item.amount);
  if (Math.abs(diff) > tol) return null;
  const days = dayNum(mov.fecha) - dayNum(item.fecha);
  if (days < -opt.maxDaysBefore || days > opt.maxDaysAfter) return null;
  const lag = days < 0 ? -days * 3 : days;
  const score = (Math.abs(diff) <= 0.01 ? 60 : 50) + 25 * Math.max(0, 1 - lag / 45) + textScore(mov, item.counterparty, item.refs, item.cfdi.uuid);
  return { score: Math.round(score), diff, days };
}

function* subsets(arr, size, start = 0, acc = []) {
  if (acc.length === size) { yield acc; return; }
  for (let i = start; i < arr.length; i++) yield* subsets(arr, size, i + 1, [...acc, arr[i]]);
}

// One transfer paying 2-3 open CFDIs of the same counterparty, which the description must name.
function findGroup(mov, openItems, opt) {
  const groups = new Map();
  for (const it of openItems) {
    if (it.direction !== mov.tipo) continue;
    const days = dayNum(mov.fecha) - dayNum(it.fecha);
    if (days < -opt.maxDaysBefore || days > opt.maxDaysAfter) continue;
    const k = it.counterparty.rfc;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  let best = null;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ts = textScore(mov, group[0].counterparty);
    if (!ts) continue;
    const pool = group.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 14);
    for (const size of [2, 3]) {
      for (const combo of subsets(pool, size)) {
        const diff = round2(mov.monto - combo.reduce((s, i) => s + i.amount, 0));
        if (Math.abs(diff) > opt.tolerance) continue;
        if (!best || ts > best.ts || (ts === best.ts && Math.abs(diff) < Math.abs(best.diff))) best = { items: [...combo], diff, ts };
      }
    }
  }
  return best;
}

const confidence = (score) => (score >= 85 ? 'alta' : score >= 70 ? 'media' : 'baja');

function warningsFor(m) {
  const out = [];
  for (const it of m.items) {
    if (it.kind === 'factura' && it.cfdi.metodoPago === 'PPD') out.push(`${it.label}: factura PPD sin complemento de pago (REP)`);
    if (it.foreign) out.push(`${it.label}: CFDI en ${it.cfdi.moneda}, revisar tipo de cambio`);
  }
  if (Math.abs(m.diff) > 0.01) out.push(`Diferencia de $${Math.abs(m.diff).toFixed(2)} contra el CFDI`);
  if (m.days > 30) out.push(`Pagada ${m.days} días después de la fecha del CFDI`);
  return out;
}

const UNMATCHED_RULES = [
  { re: /IVA.*COMISION|COMISION.*IVA/, categoria: 'IVA de comisión bancaria', account: 'ivaAcreditablePagado' },
  { re: /COMISION|CUOTA|ANUALIDAD/, categoria: 'Comisión bancaria', account: 'gastosFinancieros' },
  { re: /NOMINA/, categoria: 'Nómina: se concilia contra CFDI de nómina' },
  { re: /\bSAT\b|IMPUESTO|ISR|IMSS|INFONAVIT/, categoria: 'Pago de impuestos o cuotas' },
  { re: /INTERES/, categoria: 'Intereses bancarios' },
];

function classify(mov) {
  const desc = normalize(mov.descripcion);
  return UNMATCHED_RULES.find((r) => r.re.test(desc)) || { categoria: 'Sin identificar: investigar' };
}

const line = ([cuenta, nombre], cargo, abono) => ({ cuenta, nombre, cargo: round2(cargo), abono: round2(abono) });

function entryForMatch(m) {
  const mov = m.movement;
  const total = round2(m.items.reduce((s, i) => s + i.amount, 0));
  const iva = round2(m.items.reduce((s, i) => s + i.iva, 0));
  const diff = round2(mov.monto - total);
  const who = m.items[0].counterparty.nombre || m.items[0].counterparty.rfc;
  const refs = m.items.map((i) => i.label).join(', ');
  const lines = [];
  if (mov.tipo === 'abono') {
    lines.push(line(ACCOUNTS.bancos, mov.monto, 0), line(ACCOUNTS.clientes, 0, total));
    if (diff) lines.push(diff > 0 ? line(ACCOUNTS.porAclarar, 0, diff) : line(ACCOUNTS.porAclarar, -diff, 0));
    if (iva) lines.push(line(ACCOUNTS.ivaTrasladadoNoCobrado, iva, 0), line(ACCOUNTS.ivaTrasladadoCobrado, 0, iva));
    return { fecha: mov.fecha, concepto: `Cobro a ${who} · ${refs}`, movimiento: mov.id, lines };
  }
  lines.push(line(ACCOUNTS.proveedores, total, 0));
  if (diff) lines.push(diff > 0 ? line(ACCOUNTS.porAclarar, diff, 0) : line(ACCOUNTS.porAclarar, 0, -diff));
  lines.push(line(ACCOUNTS.bancos, 0, mov.monto));
  if (iva) lines.push(line(ACCOUNTS.ivaAcreditablePagado, iva, 0), line(ACCOUNTS.ivaPendientePago, 0, iva));
  return { fecha: mov.fecha, concepto: `Pago a ${who} · ${refs}`, movimiento: mov.id, lines };
}

export function reconcile({ cfdis, movements, companyRfc, options = {} }) {
  const opt = { ...DEFAULTS, ...options };
  const rfc = (companyRfc || detectCompanyRfc(cfdis)).toUpperCase();
  const { items, excluded } = buildItems(cfdis, rfc);

  const pairs = [];
  for (const mov of movements) {
    for (const item of items) {
      const s = scorePair(mov, item, opt);
      if (s && s.score >= opt.minScore) pairs.push({ mov, item, ...s });
    }
  }
  pairs.sort((a, b) => b.score - a.score || Math.abs(a.days) - Math.abs(b.days));

  const usedMov = new Set();
  const usedItem = new Set();
  const matches = [];
  for (const p of pairs) {
    if (usedMov.has(p.mov.id) || usedItem.has(p.item.key)) continue;
    usedMov.add(p.mov.id);
    usedItem.add(p.item.key);
    matches.push({ movement: p.mov, items: [p.item], score: p.score, tipo: '1 a 1', diff: p.diff, days: p.days });
  }

  for (const mov of movements) {
    if (usedMov.has(mov.id)) continue;
    const group = findGroup(mov, items.filter((i) => !usedItem.has(i.key)), opt);
    if (!group) continue;
    usedMov.add(mov.id);
    group.items.forEach((i) => usedItem.add(i.key));
    const days = Math.max(...group.items.map((i) => dayNum(mov.fecha) - dayNum(i.fecha)));
    matches.push({ movement: mov, items: group.items, score: 72, tipo: `Agrupado (${group.items.length})`, diff: group.diff, days });
  }

  matches.sort((a, b) => a.movement.fecha.localeCompare(b.movement.fecha) || a.movement.id.localeCompare(b.movement.id));
  for (const m of matches) {
    m.confianza = confidence(m.score);
    m.avisos = warningsFor(m);
    m.notas = m.items.filter((i) => i.kind === 'pago').map((i) => `Complemento de pago de ${i.relacionados.join(', ')}`);
  }

  const unmatchedMovements = movements.filter((m) => !usedMov.has(m.id)).map((m) => ({ movement: m, ...classify(m) }));
  const unmatchedItems = items
    .filter((i) => !usedItem.has(i.key))
    .map((i) => ({
      item: i,
      estado: i.kind === 'pago' ? 'Complemento sin movimiento bancario'
        : `${i.direction === 'abono' ? 'Pendiente de cobro' : 'Pendiente de pago'}${i.cfdi.metodoPago === 'PPD' ? ' (PPD)' : ''}`,
    }));

  const entries = [
    ...matches.map(entryForMatch),
    ...unmatchedMovements
      .filter((u) => u.account && u.movement.tipo === 'cargo')
      .map((u) => ({
        fecha: u.movement.fecha,
        concepto: `${u.categoria} · ${u.movement.descripcion}`,
        movimiento: u.movement.id,
        lines: [line(ACCOUNTS[u.account], u.movement.monto, 0), line(ACCOUNTS.bancos, 0, u.movement.monto)],
      })),
  ]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.movimiento.localeCompare(b.movimiento))
    .map((e, i) => ({ id: `PD-${String(i + 1).padStart(3, '0')}`, ...e }));

  const sum = (list) => round2(list.reduce((s, m) => s + m.monto, 0));
  return {
    rfc,
    matches,
    unmatchedMovements,
    unmatchedItems,
    excluded,
    entries,
    summary: {
      movimientos: movements.length,
      conciliados: matches.length,
      montoTotal: sum(movements),
      montoConciliado: sum(matches.map((m) => m.movement)),
      cfdis: cfdis.length,
      cfdisPendientes: unmatchedItems.length,
      conAvisos: matches.filter((m) => m.avisos.length).length,
      polizas: entries.length,
    },
  };
}
