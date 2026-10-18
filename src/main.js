import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initI18n } from './i18n.js';

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const mobile = window.innerWidth < 760 || !finePointer;

// ---- Marquee: duplicate the list so the CSS loop is seamless -------------------
const marqueeTrack = document.querySelector('.marquee__track');
function buildMarquee() {
  const source = marqueeTrack.querySelector('ul[data-i18n]');
  marqueeTrack.querySelectorAll('ul[aria-hidden]').forEach((u) => u.remove());
  const copy = source.cloneNode(true);
  copy.removeAttribute('data-i18n');
  copy.setAttribute('aria-hidden', 'true');
  marqueeTrack.append(copy);
}

// ---- Language -----------------------------------------------------------------
initI18n(() => {
  buildMarquee();
  restartTerminal();
  ScrollTrigger.refresh();
});
buildMarquee();

// ---- 3D scene (loaded lazily so text paints first) ----------------------------
let scene = null;
const canvas = document.getElementById('webgl');
import('./scene.js')
  .then(({ createScene }) => {
    scene = createScene(canvas, { mobile, reduced });
    document.body.classList.add('webgl-ready');
    syncScene();
  })
  .catch((err) => {
    console.warn('[Trento] WebGL unavailable, using fallback background.', err);
    document.body.classList.add('no-webgl');
  });

// ---- Smooth scroll ----------------------------------------------------------------
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (ev) => {
    const id = a.getAttribute('href');
    const target = id === '#top' ? 0 : document.querySelector(id);
    if (target === null) return;
    ev.preventDefault();
    closeMenu();
    if (lenis) lenis.scrollTo(target, { offset: -70, duration: 1.4 });
    else if (target === 0) window.scrollTo(0, 0);
    else target.scrollIntoView();
  });
});

// ---- Nav ------------------------------------------------------------------------
const nav = document.getElementById('nav');
const burger = document.getElementById('burger');
ScrollTrigger.create({
  start: 40,
  onToggle: (self) => nav.classList.toggle('is-scrolled', self.isActive),
});
function closeMenu() {
  nav.classList.remove('is-open');
  burger.setAttribute('aria-expanded', 'false');
}
burger.addEventListener('click', () => {
  const open = !nav.classList.contains('is-open');
  nav.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', String(open));
});

// ---- Scene choreography -----------------------------------------------------------
const sceneState = { morph: 0, dim: 0 };
function syncScene() {
  if (!scene) return;
  scene.setMorph(sceneState.morph);
  scene.setDim(sceneState.dim);
}

const steps = [...document.querySelectorAll('.step')];
const progressBar = document.querySelector('.progress i');

ScrollTrigger.create({
  trigger: '#transform',
  start: 'top top',
  end: () => `+=${window.innerHeight * 2.4}`,
  pin: '.transform__stage',
  scrub: true,
  onUpdate(self) {
    const p = self.progress;
    sceneState.morph = p * 2;
    syncScene();
    const active = Math.min(steps.length - 1, Math.floor(p * steps.length));
    steps.forEach((s, i) => s.classList.toggle('is-active', i === active));
    progressBar.style.transform = `scaleY(${p})`;
  },
});

// Dim the scene behind content so text stays legible; full brightness in the hero and pinned story.
const services = document.getElementById('servicios');
function updateDim() {
  const dim = services.getBoundingClientRect().top < window.innerHeight * 0.8 ? 0.8 : 0;
  if (dim !== sceneState.dim) {
    sceneState.dim = dim;
    syncScene();
  }
}
window.addEventListener('scroll', updateDim, { passive: true });
updateDim();

// ---- Intro + reveals --------------------------------------------------------------
if (!reduced) {
  gsap.from('[data-anim]', {
    y: 40, opacity: 0, filter: 'blur(10px)', duration: 1.2, stagger: 0.12, ease: 'power3.out', delay: 0.15,
  });
  gsap.from('.chip', { opacity: 0, scale: 0.85, duration: 1, stagger: 0.2, delay: 0.9, ease: 'back.out(1.6)' });

  gsap.utils.toArray('.reveal').forEach((el) => {
    gsap.from(el, {
      y: 50, opacity: 0, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });

  gsap.to('.timeline__line i', {
    scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: '.timeline', start: 'top 70%', end: 'bottom 60%', scrub: true },
  });

  // Hero text drifts up and fades as the scene takes over.
  gsap.to('.hero__inner', {
    y: -80, opacity: 0, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
} else {
  document.querySelector('.timeline__line i').style.transform = 'scaleY(1)';
}

// ---- Pointer: parallax, tilt, magnetic, glow ------------------------------------
if (finePointer && !reduced) {
  const glow = document.querySelector('.cursor-glow');
  const chips = [...document.querySelectorAll('.chip')];

  window.addEventListener('pointermove', (e) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    scene?.setPointer(nx, ny);
    glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    chips.forEach((c) => {
      const d = Number(c.dataset.depth || 1);
      c.style.translate = `${nx * 18 * d}px ${ny * 14 * d}px`;
    });
  });

  document.querySelectorAll('.tilt').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--rx', `${(0.5 - y) * 8}deg`);
      card.style.setProperty('--ry', `${(x - 0.5) * 10}deg`);
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });

  document.querySelectorAll('.magnetic').forEach((btn) => {
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      gsap.to(btn, { x: (e.clientX - r.left - r.width / 2) * 0.25, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.4 });
    });
    btn.addEventListener('pointerleave', () => gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' }));
  });
}

// ---- Terminal typing ----------------------------------------------------------------
const term = document.getElementById('terminal');
const SCRIPT = {
  es: [
    ['$ ', 'python reconcile.py --banco --cfdi'],
    ['', '→ Leyendo estados de cuenta…'],
    ['', '→ Cruzando movimientos contra CFDI y órdenes de compra…'],
    ['ok', '✓ Movimientos conciliados'],
    ['warn', '! Excepciones enviadas a revisión'],
    ['ok', '✓ Pólizas generadas en el ERP'],
  ],
  en: [
    ['$ ', 'python reconcile.py --bank --einvoice'],
    ['', '→ Reading bank statements…'],
    ['', '→ Matching transactions to e-invoices and POs…'],
    ['ok', '✓ Transactions reconciled'],
    ['warn', '! Exceptions sent for review'],
    ['ok', '✓ Journal entries posted to the ERP'],
  ],
};
let termTimer = null;
let termVisible = false;

function restartTerminal() {
  clearTimeout(termTimer);
  term.innerHTML = '';
  if (termVisible || reduced) typeTerminal();
}

function typeTerminal() {
  const lines = SCRIPT[document.documentElement.lang === 'en' ? 'en' : 'es'];
  term.innerHTML = '';
  if (reduced) {
    term.innerHTML = lines.map(([k, t]) => lineHTML(k, t)).join('');
    return;
  }
  let li = 0;
  let ci = 0;
  let current = null;
  const tick = () => {
    if (li >= lines.length) {
      termTimer = setTimeout(typeTerminal, 3200);
      return;
    }
    const [kind, text] = lines[li];
    if (!current) {
      term.insertAdjacentHTML('beforeend', lineHTML(kind, ''));
      current = term.lastElementChild.querySelector('.t');
    }
    const isCmd = kind === '$ ';
    if (isCmd && ci < text.length) {
      current.textContent += text[ci++];
      termTimer = setTimeout(tick, 28);
      return;
    }
    if (!isCmd) current.textContent = text;
    li++; ci = 0; current = null;
    termTimer = setTimeout(tick, isCmd ? 450 : 520);
  };
  tick();
}

function lineHTML(kind, text) {
  const cls = kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn' : kind === '$ ' ? 'cmd' : 'dim';
  const prompt = kind === '$ ' ? '<span class="p">$</span> ' : '';
  return `<span class="ln ${cls}">${prompt}<span class="t">${text}</span></span>`;
}

new IntersectionObserver(([entry]) => {
  const wasVisible = termVisible;
  termVisible = entry.isIntersecting;
  if (termVisible && !wasVisible && !term.childElementCount) typeTerminal();
}, { threshold: 0.3 }).observe(term);
if (reduced) typeTerminal();
