# Trento Solutions — sitio web

Sitio estático (Vite) con inicio, página Nosotros, demo y aviso de privacidad, en español/inglés. Estilo cálido: fondo crema, tinta índigo y un color por servicio (verde = automatización, coral = asesorías, miel = acompañamiento).

## Editar textos

- **Español:** directamente en `index.html` y `nosotros.html` (cada texto traducible tiene un atributo `data-i18n`).
- **Borradores:** las secciones marcadas con la etiqueta `Borrador` (`<span class="draft">`) esperan el texto definitivo; quita la etiqueta al aprobarlas.
- **Calendario:** pega la liga de agenda en `BOOKING_URL` (`src/main.js`). El formulario de contacto arma un correo a contacto@.
- **Inglés:** en `src/i18n.js`, usando la misma clave `data-i18n`.
- **Aviso de privacidad:** `aviso-privacidad.html` (solo español).

## Desarrollo local

Requiere Node 20+.

```bash
npm install
npm run dev      # http://localhost:5173/
npm run build    # genera dist/
```

## Publicación

Cada push a `main` compila y publica en GitHub Pages mediante `.github/workflows/deploy.yml`.
En **Settings → Pages → Build and deployment → Source** debe estar seleccionado **GitHub Actions**.

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/main.js` | Menú, aparición al hacer scroll, formulario de contacto y liga de agenda |
| `src/i18n.js` | Textos en inglés y cambio de idioma |
| `src/style.css` | Estilos |
