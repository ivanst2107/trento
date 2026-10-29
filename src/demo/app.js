import '../style.css';
import './demo.css';
import { parseCfdi } from './cfdi.js';
import { parseBankCsv } from './bank.js';
import { reconcile, detectCompanyRfc, cfdiLabel } from './reconcile.js';
import { parseEfosCsv, checkEfos } from './efos.js';
import { generateSample } from './sample.js';

const $ = (id) => document.getElementById(id);
const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const signed = (m) => `<span class="amt amt--${m.tipo}">${m.tipo === 'cargo' ? '−' : '+'}${mxn.format(m.monto)}</span>`;

const state = { xmlFiles: [], csvText: '', efosCsv: '', isSample: false, result: null, tab: 'matches' };

// ---------- Reconciliation ----------
function showErrors(list) {
  const box = $('errors');
  box.hidden = !list.length;
  box.innerHTML = list.length ? `<strong>Revisa lo siguiente:</strong><ul>${list.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>${list.length > 8 ? `<p>…y ${list.length - 8} más.</p>` : ''}` : '';
}

function run() {
  const errors = [];
  const seen = new Set();
  const cfdis = [];
  for (const f of state.xmlFiles) {
    try {
      const c = parseCfdi(f.xml);
      if (!seen.has(c.uuid)) { seen.add(c.uuid); cfdis.push(c); }
    } catch (e) {
      errors.push(`${f.name}: ${e.message}`);
    }
  }
  let bank;
  try {
    bank = parseBankCsv(state.csvText);
  } catch (e) {
    showErrors([`Estado de cuenta: ${e.message}`]);
    return;
  }
  errors.push(...bank.warnings.map((w) => `Estado de cuenta, ${w}`));
  if (!cfdis.length) {
    showErrors(errors.length ? errors : ['No se pudo leer ningún CFDI']);
    return;
  }
  showErrors(errors);

  const companyRfc = detectCompanyRfc(cfdis);
  state.result = reconcile({ cfdis, movements: bank.movements, companyRfc, options: { tolerance: 1 } });
  const paid = new Set(state.result.matches.flatMap((m) => m.items.map((it) => it.cfdi.uuid)));
  state.result.efos = checkEfos({ cfdis, companyRfc, list: parseEfosCsv(state.efosCsv), paid });
  render();
}

// ---------- Rendering ----------
const TABS = {
  matches: { label: 'Conciliados', count: (r) => r.matches.length },
  movs: { label: 'Movimientos sin CFDI', count: (r) => r.unmatchedMovements.length },
  cfdis: { label: 'CFDI sin movimiento', count: (r) => r.unmatchedItems.length },
  entries: { label: 'Pólizas', count: (r) => r.entries.length },
  efos: { label: 'Lista 69-B', count: (r) => r.efos.hits.length },
};

function render() {
  const r = state.result;
  const s = r.summary;
  const pct = s.movimientos ? Math.round((s.conciliados / s.movimientos) * 100) : 0;
  const pctMonto = s.montoTotal ? Math.round((s.montoConciliado / s.montoTotal) * 100) : 0;
  $('kpis').innerHTML = [
    ['Movimientos conciliados', `${s.conciliados}<small>/${s.movimientos}</small>`, `${pct}% del estado de cuenta`],
    ['Monto conciliado', mxn.format(s.montoConciliado), `${pctMonto}% de ${mxn.format(s.montoTotal)}`],
    ['CFDI por cobrar o pagar', s.cfdisPendientes, `de ${s.cfdis} CFDI cargados`],
    ['Para revisar', s.conAvisos, 'conciliados con avisos'],
    ['Pólizas en borrador', s.polizas, `RFC ${r.rfc}`],
    ['Proveedores en lista 69-B', r.efos.proveedores, `IVA en riesgo ${mxn.format(r.efos.ivaEnRiesgo)}`],
  ].map(([k, v, sub]) => `<div class="kpi"><span class="kpi__label">${k}</span><span class="kpi__value">${v}</span><span class="kpi__sub">${esc(sub)}</span></div>`).join('');

  $('tabs').innerHTML = Object.entries(TABS).map(([key, t]) =>
    `<button type="button" role="tab" data-tab="${key}" aria-selected="${key === state.tab}">${t.label}<span>${t.count(r)}</span></button>`).join('');
  $('sampleNote').hidden = !state.isSample;
  $('results').hidden = false;
  renderTable();
}

const confPill = (c) => `<span class="pill pill--${c}">${c}</span>`;
const cfdiCell = (it) => `<strong>${esc(it.label)}</strong><small>${esc(it.counterparty.nombre || it.counterparty.rfc)} · ${esc(it.counterparty.rfc)}</small>`;
const excludedKind = (c, issued) =>
  ({ I: issued ? 'Venta' : 'Compra', E: 'Nota de crédito', P: 'Complemento de pago', N: 'Nómina', T: 'Traslado' })[c.tipo] || `Tipo ${esc(c.tipo)}`;
const kindLabel = (it) => (it.kind === 'pago' ? 'Complemento de pago' : it.direction === 'abono' ? 'Venta' : 'Compra');

const VIEWS = {
  matches: (r) => ({
    head: ['Fecha', 'Movimiento bancario', 'Monto', 'CFDI', 'Tipo', 'Confianza', 'Avisos'],
    rows: r.matches.map((m) => [
      dmy(m.movement.fecha),
      `${esc(m.movement.descripcion)}${m.movement.referencia ? `<small>Ref. ${esc(m.movement.referencia)}</small>` : ''}`,
      signed(m.movement),
      m.items.map(cfdiCell).join('<hr>'),
      esc(m.tipo),
      confPill(m.confianza),
      [
        m.avisos.length ? `<ul class="warn">${m.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '',
        ...m.notas.map((n) => `<span class="ok">${esc(n)}</span>`),
      ].join('') || '<span class="ok">Sin observaciones</span>',
    ]),
  }),
  movs: (r) => ({
    head: ['Fecha', 'Descripción', 'Referencia', 'Monto', 'Clasificación sugerida'],
    rows: r.unmatchedMovements.map((u) => [
      dmy(u.movement.fecha), esc(u.movement.descripcion), esc(u.movement.referencia), signed(u.movement),
      `${esc(u.categoria)}${u.account ? '<small>Póliza en borrador generada</small>' : ''}`,
    ]),
  }),
  cfdis: (r) => ({
    head: ['Fecha', 'CFDI', 'Tipo', 'Total', 'Estado'],
    rows: [
      ...r.unmatchedItems.map((u) => [dmy(u.item.fecha), cfdiCell(u.item), kindLabel(u.item), mxn.format(u.item.amount), `<span class="status">${esc(u.estado)}</span>`]),
      ...r.excluded.map((e) => {
        const issued = e.cfdi.emisor.rfc === r.rfc;
        const cp = issued ? e.cfdi.receptor : e.cfdi.emisor;
        return [dmy(e.cfdi.fecha), cfdiCell({ label: cfdiLabel(e.cfdi), counterparty: cp }), excludedKind(e.cfdi, issued), mxn.format(e.cfdi.total), `<span class="status status--muted">${esc(e.motivo)}</span>`];
      }),
    ],
  }),
  efos: (r) => ({
    caption: 'Facturas recibidas de proveedores que el SAT señala por operaciones simuladas (art. 69-B CFF). En la demo la lista también es ficticia; en el servicio se compara contra el listado oficial del SAT.',
    head: ['Riesgo', 'Proveedor', 'Situación SAT', 'CFDI', 'IVA en riesgo', 'Qué hacer'],
    rows: r.efos.hits.map((h) => [
      `<span class="pill pill--${h.riesgo}">${h.riesgo}</span>`,
      `<strong>${esc(h.cfdi.emisor.nombre)}</strong><small>${esc(h.cfdi.emisor.rfc)}</small>`,
      esc(h.situacion),
      `<strong>${esc(cfdiLabel(h.cfdi))}</strong><small>${dmy(h.cfdi.fecha)} · ${mxn.format(h.cfdi.total)} · ${h.pagado ? 'pagada' : 'sin pagar'}</small>`,
      mxn.format(h.cfdi.iva),
      `${esc(h.accion)}${h.pagado ? '' : '<small>Sin pagar: aclarar con el proveedor antes de pagar.</small>'}`,
    ]),
  }),
  entries: (r) => ({
    head: ['Póliza', 'Cuenta', 'Nombre', 'Cargo', 'Abono'],
    rows: r.entries.flatMap((e) => [
      { cls: 'entry-head', cells: [`<strong>${e.id}</strong> · ${dmy(e.fecha)}`, { colspan: 4, html: esc(e.concepto) }] },
      ...e.lines.map((l) => ['', `<code>${esc(l.cuenta)}</code>`, esc(l.nombre), l.cargo ? mxn.format(l.cargo) : '', l.abono ? mxn.format(l.abono) : '']),
    ]),
  }),
};

function renderTable() {
  for (const b of $('tabs').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
  const { head, rows, caption } = VIEWS[state.tab](state.result);
  const cell = (c) => (typeof c === 'object' ? `<td colspan="${c.colspan}">${c.html}</td>` : `<td>${c}</td>`);
  const body = rows.length
    ? rows.map((row) => (Array.isArray(row) ? `<tr>${row.map(cell).join('')}</tr>` : `<tr class="${row.cls}">${row.cells.map(cell).join('')}</tr>`)).join('')
    : `<tr><td colspan="${head.length}" class="empty">Nada por aquí.</td></tr>`;
  $('table').innerHTML = `<table class="tbl tbl--${state.tab}">${caption ? `<caption>${esc(caption)}</caption>` : ''}<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

// ---------- Export ----------
const EXPORTS = {
  matches: (r) => [
    ['Fecha', 'Descripcion', 'Referencia', 'Tipo movimiento', 'Monto', 'CFDI', 'UUID', 'RFC contraparte', 'Tipo', 'Confianza', 'Diferencia', 'Avisos'],
    ...r.matches.flatMap((m) => m.items.map((it) => [
      m.movement.fecha, m.movement.descripcion, m.movement.referencia, m.movement.tipo, m.movement.monto,
      it.label, it.cfdi.uuid, it.counterparty.rfc, m.tipo, m.confianza, m.diff, [...m.avisos, ...m.notas].join(' | '),
    ])),
  ],
  movs: (r) => [
    ['Fecha', 'Descripcion', 'Referencia', 'Tipo movimiento', 'Monto', 'Clasificacion sugerida'],
    ...r.unmatchedMovements.map((u) => [u.movement.fecha, u.movement.descripcion, u.movement.referencia, u.movement.tipo, u.movement.monto, u.categoria]),
  ],
  cfdis: (r) => [
    ['Fecha', 'CFDI', 'UUID', 'RFC contraparte', 'Contraparte', 'Total', 'Estado'],
    ...r.unmatchedItems.map((u) => [u.item.fecha, u.item.label, u.item.cfdi.uuid, u.item.counterparty.rfc, u.item.counterparty.nombre, u.item.amount, u.estado]),
    ...r.excluded.map((e) => [e.cfdi.fecha, cfdiLabel(e.cfdi), e.cfdi.uuid, '', '', e.cfdi.total, e.motivo]),
  ],
  efos: (r) => [
    ['Riesgo', 'RFC proveedor', 'Proveedor', 'Situacion SAT', 'CFDI', 'UUID', 'Fecha', 'Total', 'IVA', 'Pagada', 'Que hacer'],
    ...r.efos.hits.map((h) => [h.riesgo, h.cfdi.emisor.rfc, h.cfdi.emisor.nombre, h.situacion, cfdiLabel(h.cfdi), h.cfdi.uuid, h.cfdi.fecha, h.cfdi.total, h.cfdi.iva, h.pagado ? 'Si' : 'No', h.accion]),
  ],
  entries: (r) => [
    ['Poliza', 'Fecha', 'Concepto', 'Cuenta', 'Nombre', 'Cargo', 'Abono'],
    ...r.entries.flatMap((e) => e.lines.map((l) => [e.id, e.fecha, e.concepto, l.cuenta, l.nombre, l.cargo, l.abono])),
  ],
};

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportCsv() {
  const quote = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = EXPORTS[state.tab](state.result).map((r) => r.map(quote).join(',')).join('\r\n');
  download(`trento_${state.tab}.csv`, new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
}

// ---------- Sample data ----------
function runSample() {
  const sample = generateSample();
  state.xmlFiles = sample.files;
  state.csvText = sample.csv;
  state.efosCsv = sample.efosCsv;
  state.isSample = true;
  state.tab = 'matches';
  run();
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Wiring ----------
$('runSample').addEventListener('click', runSample);
$('export').addEventListener('click', exportCsv);
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  state.tab = b.dataset.tab;
  renderTable();
});
