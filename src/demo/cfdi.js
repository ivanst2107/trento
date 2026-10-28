// Parses CFDI 3.3 / 4.0 XML (including Pagos 1.0 / 2.0 complements) into plain objects.
// Matching is by local name so it works regardless of namespace prefixes.

const num = (v) => (v == null || v === '' ? 0 : Number(v));
const attr = (el, name) => (el ? el.getAttribute(name) || '' : '');

function descendants(root, name) {
  const out = [];
  const all = root.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) if (all[i].localName === name) out.push(all[i]);
  return out;
}

function children(root, name) {
  const out = [];
  for (let n = root.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.localName === name) out.push(n);
  return out;
}

// IVA (impuesto 002) trasladado at the comprobante level, not per concepto.
function comprobanteIva(comp) {
  let iva = 0;
  for (const imp of children(comp, 'Impuestos')) {
    for (const traslados of children(imp, 'Traslados')) {
      for (const t of children(traslados, 'Traslado')) {
        if (attr(t, 'Impuesto') === '002') iva += num(attr(t, 'Importe'));
      }
    }
  }
  return iva;
}

function parsePagos(comp) {
  return descendants(comp, 'Pago').map((p) => {
    let iva = 0;
    for (const t of descendants(p, 'TrasladoP')) {
      if (attr(t, 'ImpuestoP') === '002') iva += num(attr(t, 'ImporteP'));
    }
    return {
      fecha: attr(p, 'FechaPago').slice(0, 10),
      monto: num(attr(p, 'Monto')),
      moneda: attr(p, 'MonedaP') || 'MXN',
      tipoCambio: num(attr(p, 'TipoCambioP')) || 1,
      iva,
      docs: descendants(p, 'DoctoRelacionado').map((d) => ({
        uuid: attr(d, 'IdDocumento').toUpperCase(),
        impPagado: num(attr(d, 'ImpPagado')),
      })),
    };
  });
}

export function parseCfdi(xml, Parser = globalThis.DOMParser) {
  const doc = new Parser().parseFromString(xml, 'application/xml');
  const comp = doc.documentElement;
  if (!comp || comp.localName !== 'Comprobante') throw new Error('No es un CFDI (falta cfdi:Comprobante)');

  const emisor = children(comp, 'Emisor')[0];
  const receptor = children(comp, 'Receptor')[0];
  const tfd = descendants(comp, 'TimbreFiscalDigital')[0];
  const uuid = attr(tfd, 'UUID').toUpperCase();
  if (!uuid) throw new Error('CFDI sin timbre fiscal (UUID)');

  const tipo = attr(comp, 'TipoDeComprobante');
  return {
    uuid,
    serie: attr(comp, 'Serie'),
    folio: attr(comp, 'Folio'),
    fecha: attr(comp, 'Fecha').slice(0, 10),
    tipo,
    metodoPago: attr(comp, 'MetodoPago'),
    formaPago: attr(comp, 'FormaPago'),
    moneda: attr(comp, 'Moneda') || 'MXN',
    tipoCambio: num(attr(comp, 'TipoCambio')) || 1,
    subtotal: num(attr(comp, 'SubTotal')),
    total: num(attr(comp, 'Total')),
    iva: comprobanteIva(comp),
    emisor: { rfc: attr(emisor, 'Rfc').toUpperCase(), nombre: attr(emisor, 'Nombre') },
    receptor: { rfc: attr(receptor, 'Rfc').toUpperCase(), nombre: attr(receptor, 'Nombre') },
    pagos: tipo === 'P' ? parsePagos(comp) : [],
  };
}
