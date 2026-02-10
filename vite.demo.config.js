import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'demo',
  base: '/ngraph.svg/',
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, 'docs'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'demo/index.html'),
        'graph-explorer': resolve(import.meta.dirname, 'demo/graph-explorer.html'),
        'chinese-vocab': resolve(import.meta.dirname, 'demo/chinese-vocab.html'),
      }
    }
  }
});
