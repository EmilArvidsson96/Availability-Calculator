import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed to GitHub Pages at https://<user>.github.io/Availability-Calculator/
// so the production base path must match the repo name. Dev serves from root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Availability-Calculator/' : '/',
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
}));
