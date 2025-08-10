import createGraph from 'ngraph.graph';
import createRenderer from '../../index.js';

const graph = createGraph();
graph.addLink(0, 1);

const renderer = createRenderer(graph);
renderer.run();
