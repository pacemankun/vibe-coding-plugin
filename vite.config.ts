import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'chrome120',
    rollupOptions: {
      input: { popup: resolve(import.meta.dirname, 'popup.html'), background: resolve(import.meta.dirname, 'src/background/index.ts') },
      output: { entryFileNames: (chunk) => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js' },
    },
  },
});
