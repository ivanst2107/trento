import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = (file) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  // Served at the custom domain root: https://trentosolutions.com/
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: root('./index.html'),
        about: root('./nosotros.html'),
        privacy: root('./aviso-privacidad.html'),
        demo: root('./demo/index.html'),
      },
    },
  },
});
