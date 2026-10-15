import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { resolveApiConfig } from './src/shared/api/config';

export default defineConfig(({ mode }) => {
  resolveApiConfig({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env });
  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173, strictPort: true },
    test: {
      exclude: [...configDefaults.exclude, 'e2e/**', 'scripts/**'],
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  };
});
