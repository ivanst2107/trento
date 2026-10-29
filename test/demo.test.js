import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseCfdi } from '../src/demo/cfdi.js';
import { parseBankCsv, parseAmount, parseDate } from '../src/demo/bank.js';
import { reconcile, detectCompanyRfc } from '../src/demo/reconcile.js';
import { generateSample, SAMPLE_COMPANY } from '../src/demo/sample.js';
import { parseEfosCsv, checkEfos } from '../src/demo/efos.js';

function runSample() {
  const sample = generateSample();
  const cfdis = sample.files.map((f) => parseCfdi(f.xml, DOMParser));
  const { movements, warnings } = parseBankCsv(sample.csv);
  return { sample, cfdis, movements, warnings, result: reconcile({ cfdis, movements }) };
}

const matchFor = (result, desc) => result.matches.find((m) => m.movement.descripcion === desc);

test('sample is deterministic and fully parseable', () => {
  const a = generateSample();
  const b = generateSample();
  assert.equal(a.csv, b.csv);
  const { cfdis, movements, warnings } = runSample();
  assert.equal(cfdis.length, a.files.length);
  assert.equal(warnings.length, 0);
  assert.equal(movements.length, 33);
});

test('parses invoice and payment complement fields', () => {
  const { cfdis } = runSample();
  const inv = cfdis.find((c) => c.tipo === 'I' && c.emisor.rfc === SAMPLE_COMPANY.rfc);
  assert.match(inv.uuid, /^[0-9A-F]{8}-[0-9A-F]{4}-/);
  assert.equal(inv.serie, 'A');
  assert.equal(Math.round((inv.subtotal + inv.iva) * 100) / 100, inv.total);
  const rep = cfdis.find((c) => c.tipo === 'P' && c.serie === 'P');
  assert.equal(rep.pagos.length, 1);
  assert.equal(rep.pagos[0].docs.length, 1);
  assert.ok(rep.pagos[0].iva > 0);
});

test('detects the company RFC', () => {
  assert.equal(detectCompanyRfc(runSample().cfdis), SAMPLE_COMPANY.rfc);
});

test('reconciles every sample scenario', () => {
  const { result } = runSample();
  assert.equal(result.matches.length, 19);
  assert.equal(result.unmatchedMovements.length, 14);
  assert.equal(result.unmatchedItems.length, 4);

  // Identical totals resolved by the counterparty named in the description.
  assert.equal(matchFor(result, 'SPEI RECIBIDO HOTELES FICTICIOS').items[0].counterparty.rfc, 'HFM170908QW2');
  assert.equal(matchFor(result, 'SPEI RECIBIDO AUTOPARTES LEON EJEMPLO').items[0].counterparty.rfc, 'ALE190301ZX8');

  const grouped = matchFor(result, 'SPEI RECIBIDO HOTELES FICTICIOS DE MEXICO PAGO FACTURAS');
  assert.equal(grouped.items.length, 2);

  const viaRep = matchFor(result, 'SPEI RECIBIDO AUTOPARTES LEON');
  assert.equal(viaRep.items[0].kind, 'pago');
  assert.deepEqual(viaRep.avisos, []);
  assert.match(viaRep.notas[0], /Complemento de pago de A-/);
  assert.equal(result.summary.conAvisos, 2);
  assert.equal(matchFor(result, 'SPEI ENVIADO SERVICIOS CONTABLES DEMO').items[0].kind, 'pago');

  assert.ok(matchFor(result, 'SPEI RECIBIDO RESTAURANTES CASA EJEMPLO').avisos.some((a) => a.includes('PPD')));
  const short = matchFor(result, 'SPEI RECIBIDO COMERCIALIZADORA EJEMPLO');
  assert.equal(short.diff, -0.4);
  assert.ok(short.avisos.some((a) => a.includes('0.40')));

  const cats = result.unmatchedMovements.map((u) => u.categoria);
  assert.equal(cats.filter((c) => c === 'Comisión bancaria').length, 5);
  assert.equal(cats.filter((c) => c === 'IVA de comisión bancaria').length, 5);
  assert.ok(cats.includes('Sin identificar: investigar'));
  assert.ok(result.excluded.some((e) => e.cfdi.tipo === 'E'));
});

test('every draft entry balances', () => {
  const { result } = runSample();
  assert.equal(result.entries.length, 29);
  for (const e of result.entries) {
    const cargo = e.lines.reduce((s, l) => s + l.cargo, 0);
    const abono = e.lines.reduce((s, l) => s + l.abono, 0);
    assert.ok(Math.abs(cargo - abono) < 0.005, `${e.id} unbalanced: ${cargo} vs ${abono}`);
  }
  const collection = result.entries.find((e) => e.concepto.startsWith('Cobro'));
  assert.deepEqual(collection.lines.map((l) => l.cuenta), ['102.01', '105.01', '209.01', '208.01']);
});

test('bank parser handles other layouts', () => {
  const csv = 'Fecha;Concepto;Importe\n03/SEP/2026;"PAGO ""A"" PROVEEDOR";-1.234,50\n2026-09-04;DEPOSITO;$2,000.00\n05/09/26;VACIO;0\n';
  const { movements } = parseBankCsv(csv);
  assert.equal(movements.length, 2);
  assert.deepEqual(
    movements.map((m) => [m.fecha, m.tipo, m.monto, m.descripcion]),
    [['2026-09-03', 'cargo', 1234.5, 'PAGO "A" PROVEEDOR'], ['2026-09-04', 'abono', 2000, 'DEPOSITO']],
  );
  assert.equal(parseAmount('(150.00)'), -150);
  assert.equal(parseDate('7-1-2026'), '2026-01-07');
  assert.throws(() => parseBankCsv('a,b\n1,2\n'), /Fecha/);
});

test('flags received CFDI from suppliers on the 69-B list', () => {
  const { sample, cfdis, result } = runSample();
  const list = parseEfosCsv(sample.efosCsv);
  assert.equal(list.size, 6);
  assert.equal(list.get('MQE150812TY6').situacion, 'Definitivo');

  const paid = new Set(result.matches.flatMap((m) => m.items.map((it) => it.cfdi.uuid)));
  const efos = checkEfos({ cfdis, companyRfc: SAMPLE_COMPANY.rfc, list, paid });
  assert.deepEqual(efos.hits.map((h) => [h.cfdi.emisor.rfc, h.riesgo, h.pagado]), [
    ['MQE150812TY6', 'alto', true],
    ['MQE150812TY6', 'alto', false],
    ['PEM200229BV7', 'medio', true],
  ]);
  assert.equal(efos.proveedores, 2);
  const iva = efos.hits.reduce((s, h) => s + h.cfdi.iva, 0);
  assert.equal(efos.ivaEnRiesgo, Math.round(iva * 100) / 100);
  // Cleared suppliers (desvirtuado) are not flagged.
  assert.ok(!efos.hits.some((h) => h.cfdi.emisor.rfc === 'TLD181120HG5'));
});

test('69-B parser reads the official layout', () => {
  const csv = '"Información actualizada al 31 de diciembre de 2025; los listados, son públicos",,,,\r\n'
    + 'Listado completo de contribuyentes (Artículo 69-B del CFF),,,,\r\n'
    + 'No,RFC,Nombre del Contribuyente,Situación del contribuyente,Número y fecha de oficio\r\n'
    + '1,aaa010101aa1,"EMPRESA ""UNO"", S.A. DE C.V.",Sentencia Favorable,500-05\r\n'
    + '2,BBB020202BB2,"DOS\nS.C.",Definitivo,500-06\r\n';
  const list = parseEfosCsv(csv);
  assert.deepEqual(list.get('AAA010101AA1'), { nombre: 'EMPRESA "UNO", S.A. DE C.V.', situacion: 'Sentencia Favorable' });
  assert.equal(list.get('BBB020202BB2').situacion, 'Definitivo');
  assert.throws(() => parseEfosCsv('a,b\n1,2\n'), /RFC/);
});
