import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { contentPlugin } from './scripts/lib/content-plugin';

// GitHub Pages serves this repo under /My-Portfolio/. Change BASE only if the repo is renamed.
export const BASE = '/My-Portfolio/';

export default defineConfig({
  base: BASE,
  // contentPlugin() provides "virtual:content" (owned by the content agent) — keep it registered.
  plugins: [react(), contentPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Each agent / test run picks its own port through PW_PORT so runs never collide.
    port: Number(process.env.PW_PORT ?? 5173),
    strictPort: true,
  },
});
