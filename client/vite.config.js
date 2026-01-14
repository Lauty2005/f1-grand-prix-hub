import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // Página Principal (Home)
        main: resolve(__dirname, 'index.html'),
        // Página de Admin (Panel)
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});