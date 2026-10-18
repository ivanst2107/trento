import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = (file) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  // GitHub Pages serves the repo at https://<user>.github.io/trento/
  base: '/trento/',
  build: {
    // three.js is lazy-loaded in its own chunk after the page paints.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: root('./index.html'),
        privacy: root('./aviso-privacidad.html'),
      },
    },
  },
});
