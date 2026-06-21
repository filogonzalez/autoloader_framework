import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { resolveUcCatalog } from '../scripts/uc-catalog.mjs';

// Same single source as the runtime env + the analytics-query render: var.uc_catalog
// (resolved via scripts/uc-catalog.mjs). The client default cannot diverge from them.
const UC_CATALOG = resolveUcCatalog();

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  server: {
    middlewareMode: true,
  },
  build: {
    outDir: path.resolve(__dirname, './dist'),
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'recharts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Bake the configured UC (Delta) catalog into the client bundle so the Onboarding
  // wizard's new-source defaults and path hints point at the same catalog as the server.
  // Value is derived from var.uc_catalog (via resolveUcCatalog); the field stays editable.
  define: {
    'import.meta.env.VITE_UC_CATALOG': JSON.stringify(UC_CATALOG),
  },
});
