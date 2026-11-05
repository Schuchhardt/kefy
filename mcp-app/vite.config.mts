// Bundle de la vista MCP Apps de Kefy (docs/mcp-apps.md).
//
// Un solo HTML con el CSS y el JS inline (vite-plugin-singlefile): el iframe
// del host no carga scripts externos y la CSP solo declara dominios de medios.
// Salida: mcp-app/dist/kefy-app.html, que sirve lib/mcp-app/server.ts.
//
//   npm run build:mcp-app            # una vez (lo corren prebuild y predev)
//   npm run build:mcp-app -- --watch # mientras se desarrolla la vista

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: {
    alias: [
      // El código es React (tipos, hooks de @modelcontextprotocol/ext-apps/react,
      // tests con @testing-library/react), pero el bundle usa preact/compat:
      // misma API y ~120 KB menos. Sin esto la vista pasa de los 400 KB.
      { find: /^react$/, replacement: 'preact/compat' },
      { find: /^react-dom$/, replacement: 'preact/compat' },
      { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
      { find: /^react\/jsx-runtime$/, replacement: 'preact/jsx-runtime' },
      { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/jsx-dev-runtime' },
      { find: /^@\//, replacement: `${path.resolve(here, '..')}/` },
    ],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: path.resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    reportCompressedSize: true,
    // Un solo archivo: nada de chunks ni assets aparte.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { input: path.resolve(here, 'kefy-app.html') },
  },
  logLevel: 'warn',
});
