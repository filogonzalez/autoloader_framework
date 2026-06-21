import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

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
  // Build-time value from UC_CATALOG (default autoloader_console); the field stays editable.
  define: {
    'import.meta.env.VITE_UC_CATALOG': JSON.stringify(
      process.env.UC_CATALOG ?? process.env.VITE_UC_CATALOG ?? 'autoloader_console',
    ),
  },
});
