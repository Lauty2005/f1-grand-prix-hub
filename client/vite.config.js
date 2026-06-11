import { defineConfig } from 'vite';
import { resolve } from 'path';

// In production the homepage is server-rendered by the Vercel function
// `api/home.js` (vercel.json rewrites `/` -> `/api/home`). The SPA shell is
// therefore built as `app.html`, NOT `index.html`, so a static `index.html`
// never shadows the `/` rewrite on Vercel. This dev-only middleware keeps
// `vite dev` serving the shell at `/` for local development.
const serveAppAtRootInDev = {
  name: 'serve-app-html-at-root-in-dev',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/' || req.url === '/index.html') req.url = '/app.html';
      next();
    });
  },
};

export default defineConfig({
  plugins: [serveAppAtRootInDev],
  build: {
    rollupOptions: {
      input: {
        main:     resolve(__dirname, 'app.html'),
        admin:    resolve(__dirname, 'admin.html'),
        articulo: resolve(__dirname, 'articulo.html'),
        sobre:    resolve(__dirname, 'sobre.html'),
      },
      output: {
        // Stable names for entry points so the SSR function can reference
        // them without knowing the build hash. Lazy chunks keep their hashes.
        entryFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          // Keep CSS for entries stable too; everything else stays hashed
          const entries = ['main', 'admin', 'articulo', 'sobre', 'metaTags'];
          const name = assetInfo.name?.replace(/\.[^.]+$/, '') ?? '';
          if (entries.some(e => name.startsWith(e))) return 'assets/[name][extname]';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});