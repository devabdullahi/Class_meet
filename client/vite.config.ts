import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Everything under /api is proxied to the Express server, so the browser
    // only ever talks to one origin (http://localhost:5173). That makes the
    // session cookie a first-party SameSite=Lax cookie in development exactly
    // as it will be in production — no CORS, no SameSite=None.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // Two entries, not one: `redirect.html` is the MSAL redirect bridge page
      // the sign-in popup lands on. It has to be built (it imports from
      // @azure/msal-browser) but must not load the app, so it cannot live in
      // public/ and cannot be a route.
      input: {
        main: `${root}index.html`,
        redirect: `${root}redirect.html`,
      },
    },
  },
});
