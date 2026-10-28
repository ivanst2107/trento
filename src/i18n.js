// Spanish is the source language: it lives in index.html and is captured at
// startup, so only the English strings are kept here. Keys match data-i18n.
const EN = {
  'nav.services': 'Services',
  'nav.process': 'How we work',
  'nav.team': 'Team',
  'nav.demo': 'Demo',
  'nav.contact': 'Contact',

  'hero.eyebrow': 'Finance automation · Mid-size companies',
  'hero.title': 'Your accounting,<br /><em>on autopilot.</em>',
  'hero.lead': 'We automate the finance and accounting processes of mid-size companies: reconciliations, month-end close, accounts payable and reports that run on their own. So your team stops keying in data and starts making decisions.',
  'hero.cta1': 'See what we automate',
  'hero.cta2': 'How we work',
  'hero.scroll': 'Scroll',

  'chip.a': 'Bank reconciliation · automated',
  'chip.b': 'E-invoice matched to purchase order',
  'chip.c': 'Journal entry generated',

  marquee:
    '<li>Bank reconciliation</li><li>Accounts payable</li><li>Accounts receivable</li><li>E-invoice (CFDI) validation</li><li>Month-end close</li><li>Journal entries</li><li>Cash flow</li><li>ERP integration</li><li>Executive dashboards</li><li>Management reporting</li>',

  'tf.kicker': 'The transformation',
  'tf.title': 'From chaos <em>to control.</em>',
  'tf.s1.t': 'Today: everything is manual',
  'tf.s1.d': 'Spreadsheets, email and manual data entry. Information is scattered across banks, ERP and files, and the close depends on nobody making a mistake.',
  'tf.s2.t': 'We connect your data',
  'tf.s2.d': 'We integrate banks, ERP, e-invoices and your files into a single flow, with clear, traceable accounting rules.',
  'tf.s3.t': 'Automated operations',
  'tf.s3.d': 'Bots and scripts handle the repetitive work. Your team only reviews exceptions and decides with up-to-date information.',

  'sv.kicker': 'Services',
  'sv.title': 'What we <em>automate.</em>',
  'sv.lead': 'Our focus is removing manual work from finance and accounting. We design, build and maintain automation end to end.',
  'sv.c1.t': 'Python &amp; RPA automation',
  'sv.c1.d': 'Bots that reconcile bank accounts, match e-invoices against purchase orders and bills, generate journal entries and eliminate manual data entry.',
  'sv.c2.t': 'ERP integration · Odoo &amp; SAP',
  'sv.c2.d': 'We implement your ERP and connect it to banks and external systems, with a chart of accounts and cost centers designed to show the real profitability of each unit.',
  'sv.c3.t': 'BI &amp; executive dashboards',
  'sv.c3.d': 'Dashboards connected directly to your data to track liquidity, receivables, spending and margins without waiting for the close.',
  'sv.c4.t': 'Accounting close &amp; control',
  'sv.c4.d': 'We redesign your month-end close with checklists, approval flows and automated controls to close faster and with fewer errors.',
  'sv.c4.l1': 'Bank reconciliations',
  'sv.c4.l2': 'Accruals and journal entries',
  'sv.c4.l3': 'Exception review',
  'sv.c4.l4': 'Approval and reporting',

  'ad.kicker': 'Also',
  'ad.title': 'And when you need it, <em>financial advisory.</em>',
  'ad.desc': 'We keep supporting finance leaders with financial planning, cash flow forecasting and controllership. With the data already automated, analysis arrives sooner and with more confidence.',
  'ad.t2': 'Cash flow',
  'ad.t4': 'Budgeting',

  'pr.kicker': 'Method',
  'pr.title': 'How we <em>work.</em>',
  'pr.lead': 'Projects delivered in stages, with visible results from the first weeks.',
  'pr.s1.t': 'Diagnosis',
  'pr.s1.d': 'We map your finance processes and find where time is being lost.',
  'pr.s2.t': 'Design',
  'pr.s2.d': 'We define what gets automated, with which tools and with which controls.',
  'pr.s3.t': 'Build',
  'pr.s3.d': 'We develop and integrate in stages, testing on your real data.',
  'pr.s4.t': 'Operate',
  'pr.s4.d': 'We monitor, support and train your team so the automation lasts.',

  'wy.1.t': 'Founders on every project',
  'wy.1.d': 'No hand-offs to juniors. The people who design your solution build it.',
  'wy.2.t': 'Finance + code',
  'wy.2.d': 'We understand accounting and we write the code. Nothing gets lost between consultant and developer.',
  'wy.3.t': 'Built for mid-size companies',
  'wy.3.d': 'Big-corporate practices, without the complexity or licenses you don’t need.',

  'tm.kicker': 'Team',
  'tm.title': 'Founder-led <em>execution.</em>',
  'tm.lead': 'Experience in finance automation at Google, with backgrounds at Big Four firms and global corporations.',
  'tm.p1.r': 'Co-Founder · Automation &amp; Architecture',
  'tm.p1.d': 'Experience in finance process automation at Google, with a background at EY and Deloitte. Specialist in Python automation and ERP architecture (Odoo/SAP).',
  'tm.p2.r': 'Co-Founder · Finance &amp; Control',
  'tm.p2.d': 'Experience in finance process automation at Google, with a background at PwC Acceleration Centers and Takeda Mexico. Specialist in international controllership and accounting workflow optimization. MBA, Universidad Anáhuac.',
  'tm.p2.tag': 'Accounting close',

  'ct.badge': 'Write to us',
  'ct.title': 'Let’s automate <em>your operations.</em>',
  'ct.lead': 'Tell us which processes take up most of your time and we’ll get back to you soon.',

  'ft.city': 'Mexico City',
  'ft.privacy': 'Privacy Notice (Spanish)',
};

const META = {
  es: { title: document.title, description: document.querySelector('meta[name="description"]')?.content },
  en: {
    title: 'Trento Solutions | Finance & Accounting Automation',
    description: 'We automate finance and accounting processes for mid-size companies: reconciliations, month-end close, accounts payable, ERP integration and executive reporting.',
  },
};

const KEY = 'trento_lang';

function stored() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function remember(lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* storage unavailable */ }
}

export function initI18n(onChange = () => {}) {
  const nodes = [...document.querySelectorAll('[data-i18n]')];
  const ES = Object.fromEntries(nodes.map((n) => [n.dataset.i18n, n.innerHTML]));
  const dict = { es: ES, en: EN };
  const buttons = document.querySelectorAll('[data-lang]');

  function apply(lang, notify = true) {
    nodes.forEach((n) => {
      const value = dict[lang][n.dataset.i18n];
      if (value !== undefined) n.innerHTML = value;
    });
    document.documentElement.lang = lang;
    document.title = META[lang].title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', META[lang].description);
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    remember(lang);
    if (notify) onChange(lang);
  }

  buttons.forEach((b) => b.addEventListener('click', () => apply(b.dataset.lang)));

  const initial = stored() || (navigator.language?.toLowerCase().startsWith('es') ? 'es' : navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es');
  if (initial !== 'es') apply(initial, false);
  return { current: () => document.documentElement.lang };
}
