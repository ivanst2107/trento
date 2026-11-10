import './style.css';
import { initI18n } from './i18n.js';

// Liga del calendario para agendar llamadas (Google Calendar, Calendly, etc.).
// Mientras esté vacía, el botón "Ver el calendario" abre un correo a contacto@.
const BOOKING_URL = '';
const CONTACT_EMAIL = 'contacto@trentosolutions.com';

const i18n = initI18n();

// ---- Menú móvil -------------------------------------------------------------------
const nav = document.getElementById('nav');
const burger = document.getElementById('burger');
function setMenu(open) {
  nav.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', String(open));
}
burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
nav.querySelectorAll('.nav__links a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

// ---- Aparición suave al hacer scroll ------------------------------------------------
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('is-in'));
}

// ---- Agenda -----------------------------------------------------------------------
const bookBtn = document.getElementById('bookBtn');
if (bookBtn && BOOKING_URL) {
  bookBtn.href = BOOKING_URL;
  bookBtn.target = '_blank';
  bookBtn.rel = 'noopener';
}

// ---- Formulario de contacto ---------------------------------------------------------
// El sitio es estático: el formulario arma un correo a contacto@ con los datos.
const form = document.getElementById('contactForm');
if (form) {
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form));
    const en = i18n.current() === 'en';
    const subject = en ? `Contact from ${d.nombre} (${d.empresa})` : `Contacto de ${d.nombre} (${d.empresa})`;
    const body = [
      `${en ? 'Name' : 'Nombre'}: ${d.nombre}`,
      `${en ? 'Company' : 'Empresa'}: ${d.empresa}`,
      `${en ? 'Email' : 'Correo'}: ${d.correo}`,
      `${en ? 'Phone' : 'Teléfono'}: ${d.telefono || '-'}`,
      '',
      d.mensaje || '',
    ].join('\n');
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    document.getElementById('formOk').classList.add('is-on');
  });
}
