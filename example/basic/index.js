var graph = require('ngraph.graph')();
graph.addLink(0, 1);

var renderer = require('../../')(graph);
renderer.run();
