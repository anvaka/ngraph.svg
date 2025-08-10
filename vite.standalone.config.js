import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'index.js',
      name: 'ngraphSvg',
      formats: ['iife'],
      fileName: () => 'ngraph.svg.standalone.js',
    },
    // Bundle everything (no externals)
    rollupOptions: {},
    minify: 'esbuild',
    sourcemap: true
  }
});
