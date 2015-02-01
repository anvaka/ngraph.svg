var svg = require('simplesvg');

exports.nodeBuilder = nodeBuilder;
exports.nodePositionCallback = nodePositionCallback;
exports.linkBuilder = linkBuilder;
exports.linkPositionCallback = linkPositionCallback;

function nodeBuilder(node) {
  return svg("rect", {
    width: 10,
    height: 10,
    fill:  "#00a2e8"
  });
}

function nodePositionCallback(nodeUI, pos) {
  nodeUI.attr("x", pos.x - 5).attr("y", pos.y - 5);
}

function linkBuilder(linkUI, pos) {
  return svg("line", {
    stroke:  "#999"
  });
}

function linkPositionCallback(linkUI, fromPos, toPos) {
  linkUI.attr("x1", fromPos.x)
    .attr("y1", fromPos.y)
    .attr("x2", toPos.x)
    .attr("y2", toPos.y);
}
