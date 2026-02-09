import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'ngraphSvg',
      fileName: 'ngraph.svg'
    },
    rollupOptions: {
      external: ['ngraph.graph', 'ngraph.forcelayout'],
      output: {
        globals: {
          'ngraph.graph': 'createGraph',
          'ngraph.forcelayout': 'createLayout'
        }
      }
    }
  },
  root: 'demo',
  publicDir: false
});
