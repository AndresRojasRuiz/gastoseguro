import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // En desarrollo la interfaz y la API comparten origen gracias al proxy: la cookie de
    // sesión SameSite=Strict funciona igual que en producción y no hace falta relajar CORS.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    // Sin scripts en línea: compatible con la CSP estricta (script-src 'self').
    assetsInlineLimit: 0,
  },
});
