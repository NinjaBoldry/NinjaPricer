import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'app/**/*.test.ts',
      'tests/**/*.test.ts',
      'components/**/*.test.tsx',
    ],
    // DB-backed tests require DATABASE_URL — run via npm run test:integration
    exclude: ['**/*.db.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.test.ts', 'lib/**/tests/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
