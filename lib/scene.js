var svg = require('simplesvg');

module.exports = scene;

function scene(svgRoot) {
  var sceneRoot = createSceneRoot(svgRoot);
  var linksLayer = addLayer('links', sceneRoot);
  var nodesLayer = addLayer('nodes', sceneRoot);

  var api = {
    appendNode: appendNode,
    appendLink: appendLink,
    moveTo: moveTo
  };

  return api;

  function moveTo(x, y) {
    // todo: continue from here
  }

  function appendNode(nodeUI) {
    nodesLayer.append(nodeUI);
  }

  function appendLink(linkUI) {
    linksLayer.append(linkUI);
  }

  function createSceneRoot(svgRoot) {
    var elements = svg('g').attr("buffered-rendering", "dynamic");
    svgRoot.append(elements);
    return elements;
  }

  function addLayer(name, parent) {
    var layer = svg('g').attr('id', name);
    parent.append(layer);
    return layer;
  }
}
