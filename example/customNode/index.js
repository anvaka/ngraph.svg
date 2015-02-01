var graph = require('ngraph.graph')();
var render = require('../../');
var svg = render.svg;

graph.addLink(0, 1);
graph.addLink(2, 1);

var renderer = render(graph, {
  physics: {
    springLength: 60
  }
});

renderer.node(function() {
  return svg("rect", {
    width: 42,
    height: 42,
    fill: "#00a2e8"
  });
}).placeNode(function nodePositionCallback(nodeUI, pos) {
  nodeUI.attr("x", pos.x - 21).attr("y", pos.y - 21);
});

renderer.run();
