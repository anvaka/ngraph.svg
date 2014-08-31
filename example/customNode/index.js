var graph = require('ngraph.graph')();
var svg = require('simplesvg');

graph.addLink(0, 1);
graph.addLink(2, 1);

var renderer = require('../../')(graph, {
  physics: {
    springLength: 60
  }
});
renderer.node(function(node) {
  return svg("rect")
    .attr("width", 42)
    .attr("height", 42)
    .attr("fill", "#00a2e8");
}).placeNode(function nodePositionCallback(nodeUI, pos) {
  nodeUI.attr("x", pos.x - 21).attr("y", pos.y - 21);
});

renderer.run();
