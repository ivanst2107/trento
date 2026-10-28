# Trento Solutions — sitio web

Sitio de una página con escena 3D (Three.js), animaciones de scroll (GSAP + Lenis) y versión en español/inglés.

## Editar textos

- **Español:** directamente en `index.html` (cada texto traducible tiene un atributo `data-i18n`).
- **Inglés:** en `src/i18n.js`, usando la misma clave `data-i18n`.
- **Terminal animada** (tarjeta de Python): arreglo `SCRIPT` en `src/main.js`.
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
| `src/scene.js` | Escena 3D: tarjetas que pasan de caos → hélice → cuadrícula al hacer scroll |
| `src/main.js` | Scroll suave, sección fija de "Del caos al control", animaciones, efectos de cursor |
| `src/i18n.js` | Textos en inglés y cambio de idioma |
| `src/style.css` | Estilos |
