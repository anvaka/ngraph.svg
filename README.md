# ngraph.svg

Svg based graph rendering

# install

With [npm](https://npmjs.org) do:

```
npm install ngraph.svg
```

# dev/build

This repo now uses native ES modules and Vite for development and library build:

- Start examples: `npm run dev` (opens `/example/basic/index.html`).
- Build library: `npm run build`.
- Preview build: `npm run preview`.

Basic ESM usage:

```js
import createGraph from 'ngraph.graph';
import createRenderer from 'ngraph.svg';

const graph = createGraph();
graph.addLink('a', 'b');

const renderer = createRenderer(graph);
renderer.run();
```

# license

MIT
