import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        storefront: resolve(process.cwd(), 'index.html'),
        admin: resolve(process.cwd(), 'admin/index.html'),
      },
    },
  },
});
