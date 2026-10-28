// Fictitious sample data for the demo: one month of CFDI 4.0 XMLs plus the bank statement.
// Every company, RFC, UUID and amount is invented. Scenarios are hand-picked so the demo
// shows each case the matcher handles (ties broken by text, grouped payments, PPD/REP, gaps).

export const SAMPLE_COMPANY = { rfc: 'IEB150310AB1', nombre: 'INDUSTRIAS EJEMPLO DEL BAJIO', cp: '37000' };

const CUSTOMERS = [
  { rfc: 'CEN180522KJ3', nombre: 'COMERCIALIZADORA EJEMPLO DEL NORTE', cp: '64000' },
  { rfc: 'DPA200114RT6', nombre: 'DISTRIBUIDORA PACIFICO DEMO', cp: '82000' },
  { rfc: 'HFM170908QW2', nombre: 'HOTELES FICTICIOS DE MEXICO', cp: '77500' },
  { rfc: 'ALE190301ZX8', nombre: 'AUTOPARTES LEON EJEMPLO', cp: '37150' },
  { rfc: 'RCE210615LM4', nombre: 'RESTAURANTES CASA EJEMPLO', cp: '06700' },
];

const SUPPLIERS = [
  { rfc: 'AMP160411PL9', nombre: 'ACEROS Y METALES PRUEBA', cp: '66350', serie: 'AM', item: 'Lámina de acero calibre 14' },
  { rfc: 'TLD181120HG5', nombre: 'TRANSPORTES LOGISTICA DEMO', cp: '54060', serie: 'TL', item: 'Servicio de flete' },
  { rfc: 'EIF190707DS3', nombre: 'ENERGIA INDUSTRIAL FICTICIA', cp: '11000', serie: 'EI', item: 'Suministro de energía eléctrica' },
  { rfc: 'PEM200229BV7', nombre: 'PAPELERIA EJEMPLO MX', cp: '37000', serie: 'PE', item: 'Artículos de oficina' },
  { rfc: 'SCD170530NQ1', nombre: 'SERVICIOS CONTABLES DEMO', cp: '37000', serie: 'SC', item: 'Honorarios por asesoría' },
  { rfc: 'MQE150812TY6', nombre: 'MAQUINARIA Y EQUIPO EJEMPLO', cp: '45010', serie: 'MQ', item: 'Refacciones para maquinaria' },
];

const PAC_TEST_RFC = 'AAA010101AAA';

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const money = (n) => n.toFixed(2);
const fmtDateMx = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function tfd(uuid, fecha) {
  return `<tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid}" FechaTimbrado="${fecha}T12:00:00" RfcProvCertif="${PAC_TEST_RFC}" SelloCFD="DEMO" NoCertificadoSAT="00000000000000000000" SelloSAT="DEMO"/>`;
}

function party(tag, p, receptor, uso) {
  return receptor
    ? `<cfdi:Receptor Rfc="${p.rfc}" Nombre="${esc(p.nombre)}" DomicilioFiscalReceptor="${p.cp}" RegimenFiscalReceptor="601" UsoCFDI="${uso}"/>`
    : `<cfdi:${tag} Rfc="${p.rfc}" Nombre="${esc(p.nombre)}" RegimenFiscal="601"/>`;
}

function invoiceXml(c) {
  const traslado = `<cfdi:Traslado Base="${money(c.subtotal)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${money(c.iva)}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="${c.serie}" Folio="${c.folio}" Fecha="${c.fecha}T10:00:00" FormaPago="${c.metodo === 'PPD' ? '99' : '03'}" NoCertificado="00000000000000000000" Sello="DEMO" SubTotal="${money(c.subtotal)}" Moneda="MXN" Total="${money(c.total)}" TipoDeComprobante="${c.tipo}" Exportacion="01" MetodoPago="${c.metodo}" LugarExpedicion="${c.emisor.cp}">
  ${party('Emisor', c.emisor)}
  ${party('Receptor', c.receptor, true, c.tipo === 'E' ? 'G02' : 'G03')}
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="${c.clave}" Cantidad="1" ClaveUnidad="E48" Descripcion="${esc(c.descripcion)}" ValorUnitario="${money(c.subtotal)}" Importe="${money(c.subtotal)}" ObjetoImp="02">
      <cfdi:Impuestos><cfdi:Traslados>${traslado}</cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${money(c.iva)}"><cfdi:Traslados>${traslado}</cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento>${tfd(c.uuid, c.fecha)}</cfdi:Complemento>
</cfdi:Comprobante>
`;
}

function paymentXml(p, inv) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="${p.serie}" Folio="${p.folio}" Fecha="${p.fecha}T10:00:00" NoCertificado="00000000000000000000" Sello="DEMO" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="P" Exportacion="01" LugarExpedicion="${inv.emisor.cp}">
  ${party('Emisor', inv.emisor)}
  ${party('Receptor', inv.receptor, true, 'CP01')}
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales TotalTrasladosBaseIVA16="${money(inv.subtotal)}" TotalTrasladosImpuestoIVA16="${money(inv.iva)}" MontoTotalPagos="${money(inv.total)}"/>
      <pago20:Pago FechaPago="${p.fechaPago}T12:00:00" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="${money(inv.total)}">
        <pago20:DoctoRelacionado IdDocumento="${inv.uuid}" Serie="${inv.serie}" Folio="${inv.folio}" MonedaDR="MXN" EquivalenciaDR="1" NumParcialidad="1" ImpSaldoAnt="${money(inv.total)}" ImpPagado="${money(inv.total)}" ImpSaldoInsoluto="0.00" ObjetoImpDR="02">
          <pago20:ImpuestosDR><pago20:TrasladosDR><pago20:TrasladoDR BaseDR="${money(inv.subtotal)}" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="${money(inv.iva)}"/></pago20:TrasladosDR></pago20:ImpuestosDR>
        </pago20:DoctoRelacionado>
        <pago20:ImpuestosP><pago20:TrasladosP><pago20:TrasladoP BaseP="${money(inv.subtotal)}" ImpuestoP="002" TipoFactorP="Tasa" TasaOCuotaP="0.160000" ImporteP="${money(inv.iva)}"/></pago20:TrasladosP></pago20:ImpuestosP>
      </pago20:Pago>
    </pago20:Pagos>
    ${tfd(p.uuid, p.fecha)}
  </cfdi:Complemento>
</cfdi:Comprobante>
`;
}

export function generateSample(seed = 2026) {
  const rand = mulberry32(seed);
  const amount = (min, max) => Math.round((min + rand() * (max - min)) * 100) / 100;
  const uuid = () => {
    const h = Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16)).join('').toUpperCase();
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-A${h.slice(17, 20)}-${h.slice(20)}`;
  };
  const refNum = () => String(Math.floor(1000000 + rand() * 8999999));

  const files = [];
  const bank = [];
  const folios = { A: 1040, NC: 210, P: 88 };
  const supplierFolio = new Map(SUPPLIERS.map((s, i) => [s.rfc, 3100 + i * 517]));

  const me = SAMPLE_COMPANY;
  function sale(customer, fecha, subtotal, { metodo = 'PUE', tipo = 'I' } = {}) {
    const serie = tipo === 'E' ? 'NC' : 'A';
    const c = {
      uuid: uuid(), serie, folio: String(++folios[serie]), fecha, tipo, metodo, subtotal,
      iva: Math.round(subtotal * 16) / 100, emisor: me, receptor: customer,
      clave: tipo === 'E' ? '84111506' : '31162800',
      descripcion: tipo === 'E' ? 'Bonificación por pronto pago' : 'Piezas metálicas maquinadas según pedido',
    };
    c.total = Math.round((c.subtotal + c.iva) * 100) / 100;
    files.push({ name: `${c.uuid}.xml`, xml: invoiceXml(c) });
    return c;
  }
  function purchase(supplier, fecha, subtotal, metodo = 'PUE') {
    const folio = supplierFolio.get(supplier.rfc) + 1;
    supplierFolio.set(supplier.rfc, folio);
    const c = {
      uuid: uuid(), serie: supplier.serie, folio: String(folio), fecha, tipo: 'I', metodo, subtotal,
      iva: Math.round(subtotal * 16) / 100, emisor: supplier, receptor: me, clave: '31162800', descripcion: supplier.item,
    };
    c.total = Math.round((c.subtotal + c.iva) * 100) / 100;
    files.push({ name: `${c.uuid}.xml`, xml: invoiceXml(c) });
    return c;
  }
  function rep(inv, fecha, fechaPago, serie) {
    const p = { uuid: uuid(), serie, folio: serie === 'P' ? String(++folios.P) : String(supplierFolio.get(inv.emisor.rfc) + 50), fecha, fechaPago };
    files.push({ name: `${p.uuid}.xml`, xml: paymentXml(p, inv) });
  }
  const cobro = (fecha, desc, monto, ref = refNum()) => bank.push({ fecha, desc, ref, monto });
  const pago = (fecha, desc, monto, ref = refNum()) => bank.push({ fecha, desc, ref, monto: -monto });
  const ref = (c) => `${c.serie}-${c.folio}`;

  const [norte, pacifico, hoteles, autopartes, restaurantes] = CUSTOMERS;
  const [aceros, transportes, energia, papeleria, contables, maquinaria] = SUPPLIERS;

  // ---- Ventas (cobros) ----
  let c = sale(norte, '2026-08-29', amount(48000, 120000));
  cobro('2026-09-02', 'SPEI RECIBIDO COMERCIALIZADORA EJEMPLO DEL NORTE', c.total, `FAC ${ref(c)}`);
  c = sale(pacifico, '2026-09-03', amount(20000, 60000));
  cobro('2026-09-05', 'SPEI RECIBIDO DISTRIBUIDORA PACIFICO', c.total);
  // Two customers, identical totals: only the description tells them apart.
  const same = amount(25000, 40000);
  const h1 = sale(hoteles, '2026-09-04', same);
  const a1 = sale(autopartes, '2026-09-08', same);
  cobro('2026-09-12', 'SPEI RECIBIDO AUTOPARTES LEON EJEMPLO', a1.total);
  cobro('2026-09-09', 'SPEI RECIBIDO HOTELES FICTICIOS', h1.total);
  c = sale(restaurantes, '2026-09-07', amount(8000, 25000));
  cobro('2026-09-15', `DEPOSITO SPEI ${restaurantes.rfc}`, c.total);
  c = sale(norte, '2026-09-10', amount(60000, 150000));
  cobro('2026-09-18', 'SPEI RECIBIDO', c.total, ref(c));
  c = sale(pacifico, '2026-09-11', amount(15000, 45000));
  cobro('2026-09-22', 'SPEI RECIBIDO DISTRIBUIDORA PACIFICO DEMO', c.total);
  // One transfer paying two invoices.
  const g1 = sale(hoteles, '2026-09-14', amount(10000, 30000));
  const g2 = sale(hoteles, '2026-09-16', amount(10000, 30000));
  cobro('2026-09-24', 'SPEI RECIBIDO HOTELES FICTICIOS DE MEXICO PAGO FACTURAS', Math.round((g1.total + g2.total) * 100) / 100);
  // PPD invoice settled with a payment complement (REP) issued by us.
  c = sale(autopartes, '2026-08-20', amount(70000, 140000), { metodo: 'PPD' });
  rep(c, '2026-09-17', '2026-09-16', 'P');
  cobro('2026-09-16', 'SPEI RECIBIDO AUTOPARTES LEON', c.total);
  // PPD invoice paid but no REP issued yet -> warning.
  c = sale(restaurantes, '2026-08-25', amount(30000, 50000), { metodo: 'PPD' });
  cobro('2026-09-19', 'SPEI RECIBIDO RESTAURANTES CASA EJEMPLO', c.total);
  // Paid 40 cents short.
  c = sale(norte, '2026-09-17', amount(20000, 50000));
  cobro('2026-09-26', 'SPEI RECIBIDO COMERCIALIZADORA EJEMPLO', Math.round((c.total - 0.4) * 100) / 100);
  // Still open.
  sale(pacifico, '2026-09-24', amount(30000, 70000));
  sale(restaurantes, '2026-09-26', amount(9000, 20000));
  sale(hoteles, '2026-09-20', amount(1500, 4000), { tipo: 'E' });

  // ---- Compras (pagos) ----
  c = purchase(aceros, '2026-09-01', amount(90000, 180000));
  pago('2026-09-04', 'SPEI ENVIADO ACEROS Y METALES PRUEBA', c.total);
  c = purchase(aceros, '2026-09-15', amount(60000, 120000));
  pago('2026-09-25', 'SPEI ENVIADO PROVEEDOR', c.total, `FAC ${ref(c)}`);
  c = purchase(transportes, '2026-08-28', amount(12000, 30000));
  pago('2026-09-03', 'SPEI ENVIADO TRANSPORTES LOGISTICA DEMO', c.total);
  c = purchase(transportes, '2026-09-12', amount(12000, 30000));
  pago('2026-09-17', `TRANSF A ${transportes.rfc}`, c.total);
  c = purchase(energia, '2026-08-31', amount(25000, 45000));
  pago('2026-09-08', 'DOMICILIACION ENERGIA INDUSTRIAL', c.total);
  c = purchase(papeleria, '2026-09-05', amount(1200, 4500));
  pago('2026-09-06', 'SPEI ENVIADO PAPELERIA EJEMPLO', c.total);
  c = purchase(contables, '2026-09-01', amount(18000, 30000), 'PPD');
  rep(c, '2026-09-11', '2026-09-10', contables.serie);
  pago('2026-09-10', 'SPEI ENVIADO SERVICIOS CONTABLES DEMO', c.total);
  c = purchase(maquinaria, '2026-09-09', amount(40000, 90000));
  pago('2026-09-23', 'SPEI ENVIADO MAQUINARIA Y EQUIPO EJEMPLO', c.total);
  purchase(maquinaria, '2026-09-21', amount(20000, 60000));
  purchase(aceros, '2026-09-27', amount(50000, 100000));

  // ---- Movimientos sin CFDI ----
  for (const d of ['2026-09-04', '2026-09-10', '2026-09-17', '2026-09-25']) {
    pago(d, 'COMISION TRANSFERENCIA SPEI', 6, '');
    pago(d, 'IVA COMISION TRANSFERENCIA SPEI', 0.96, '');
  }
  pago('2026-09-15', 'PAGO NOMINA QUINCENAL', amount(170000, 200000), '');
  pago('2026-09-17', 'PAGO REFERENCIADO SAT', amount(80000, 110000));
  cobro('2026-09-21', 'DEPOSITO EN EFECTIVO SUC 0457', 12500, '');
  pago('2026-09-30', 'PAGO NOMINA QUINCENAL', amount(170000, 200000), '');
  pago('2026-09-30', 'COMISION MANEJO DE CUENTA', 250, '');
  pago('2026-09-30', 'IVA COMISION MANEJO DE CUENTA', 40, '');

  bank.sort((a, b) => a.fecha.localeCompare(b.fecha));
  let saldo = 1250000;
  const rows = ['Fecha,Descripcion,Referencia,Cargo,Abono,Saldo'];
  for (const m of bank) {
    saldo = Math.round((saldo + m.monto) * 100) / 100;
    rows.push([fmtDateMx(m.fecha), `"${m.desc}"`, m.ref, m.monto < 0 ? money(-m.monto) : '', m.monto > 0 ? money(m.monto) : '', money(saldo)].join(','));
  }

  return { companyRfc: me.rfc, files, csv: `${rows.join('\n')}\n` };
}
