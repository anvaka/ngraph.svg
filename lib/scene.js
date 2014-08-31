var svg = require('simplesvg');
var hammer = require('hammerjs');

module.exports = scene;

function scene(svgRoot, layout) {
  var sceneRoot = createSceneRoot(svgRoot);
  var sceneTransform = createSceneTransform(sceneRoot.element);
  var linksLayer = addLayer('links', sceneRoot);
  var nodesLayer = addLayer('nodes', sceneRoot);
  var panStatus = {};
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

  function appendNode(nodeDescriptor) {
    var ui = nodeDescriptor.ui;
    nodesLayer.append(ui);

    ui.element.node = nodeDescriptor;
    hammer(ui.element).on('panstart panmove panend', handlePan);
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

  function handlePan(e) {
    var node = e.target.node;
    var model = node.model;

    var clickPosition = getModelPosition(e.center);

    if (e.type === 'panmove') {
      var status = panStatus[model.id];
      layout.setNodePosition(model.id, clickPosition.x - status.dx , clickPosition.y - status.dy);
    } else if (e.type === 'panstart') {
      panStatus[model.id] = {
        isPinned: layout.isNodePinned(model),
        dx: clickPosition.x - node.pos.x,
        dy: clickPosition.y - node.pos.y
      };
      layout.pinNode(model, true);
    } else if (e.type === 'panend') {
      layout.pinNode(model, panStatus[model.id].isPinned);
    }
  }

  function getModelPosition(pos) {
    return {
      x: (pos.x - currentTransform.tx)/currentTransform.scale,
      y: (pos.y - currentTransform.ty)/currentTransform.scale,
    };
  }
}
