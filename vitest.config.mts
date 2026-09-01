import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'app/api/**', 'components/**'],
      exclude: ['**/*.d.ts', '**/node_modules/**'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // El SDK real de Sentry carga plugins de bundler que no funcionan fuera
      // del build de Next. Ver tests/unit/mocks/sentry.ts.
      '@sentry/nextjs': path.resolve(__dirname, 'tests/unit/mocks/sentry.ts'),
    },
  },
});
