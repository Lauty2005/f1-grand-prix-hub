import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main:     resolve(__dirname, 'index.html'),
        admin:    resolve(__dirname, 'admin.html'),
        articulo: resolve(__dirname, 'articulo.html'),
      },
      output: {
        // Stable names for entry points so the SSR function can reference
        // them without knowing the build hash. Lazy chunks keep their hashes.
        entryFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          // Keep CSS for entries stable too; everything else stays hashed
          const entries = ['main', 'admin', 'articulo', 'metaTags'];
          const name = assetInfo.name?.replace(/\.[^.]+$/, '') ?? '';
          if (entries.some(e => name.startsWith(e))) return 'assets/[name][extname]';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});