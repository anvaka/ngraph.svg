import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'index.js',
      name: 'ngraphSvg',
      // ES/UMD build for bundler consumers
      formats: ['es', 'umd'],
      fileName: (format) => `ngraph.svg.${format}.js`,
    },
    rollupOptions: {
      external: [
        'ngraph.events',
        'ngraph.forcelayout',
        'ngraph.merge',
        'simplesvg',
        'hammerjs'
      ],
      output: {
        globals: {
          'ngraph.events': 'ngraphEvents',
          'ngraph.forcelayout': 'ngraphForceLayout',
          'ngraph.merge': 'ngraphMerge',
          'simplesvg': 'simplesvg',
          'hammerjs': 'Hammer'
        }
      }
    }
  },
  server: {
    open: '/example/basic/index.html'
  }
});
