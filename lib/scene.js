var svg = require('simplesvg');

module.exports = scene;

function scene(svgRoot) {
  var sceneRoot = createSceneRoot(svgRoot);
  var sceneTransform = createSceneTransform(sceneRoot.element);
  var linksLayer = addLayer('links', sceneRoot);
  var nodesLayer = addLayer('nodes', sceneRoot);
  var currentTransform = {
    tx : 0,
    ty : 0,
    scale: 1
  };

  var api = {
    appendNode: appendNode,
    appendLink: appendLink,
    moveTo: moveTo
  };

  return api;

  function moveTo(x, y) {
    currentTransform.tx = x;
    currentTransform.ty = y;
    updateTransformMatrix();
  }

  function createSceneTransform(scene) {
    var transform = svgRoot.element.createSVGTransform();
    scene.transform.baseVal.appendItem(transform);

    return transform;
  }

  function updateTransformMatrix() {
    sceneTransform.matrix.e = currentTransform.tx;
    sceneTransform.matrix.f = currentTransform.ty;
    sceneTransform.matrix.a = sceneTransform.matrix.d = currentTransform.scale;
  }

  function appendNode(nodeUI) {
    nodesLayer.append(nodeUI);
  }

  function appendLink(linkUI) {
    linksLayer.append(linkUI);
  }

  function createSceneRoot(svgRoot) {
    var scene = svg('g').attr("buffered-rendering", "dynamic");
    svgRoot.append(scene);
    return scene;
  }

  function addLayer(name, parent) {
    var layer = svg('g').attr('id', name);
    parent.append(layer);
    return layer;
  }
}
