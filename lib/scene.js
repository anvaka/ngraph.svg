var svg = require('simplesvg');
var hammer = require('hammerjs');

module.exports = scene;

var NODE_MOVE_RECOGNIZER = { recognizers:[ [hammer.Pan, { threshold: 1 }]] };
var SCENE_MOVE_RECOGNIZER = { recognizers:[ [hammer.Pan, { threshold: 1 }]] };
var MOVE_EVENTS = 'panstart panmove panend';

function scene(container, layout) {
  var svgRoot = createSvgRoot(container);
  var sceneRoot = createSceneRoot(svgRoot);
  var sceneTransform = createSceneTransform(sceneRoot.element);
  var panSession = {};
  var panNode = 0;

  var linkLayer = addLayer('links', sceneRoot);
  var nodeLayer = addLayer('nodes', sceneRoot);

  var nodes = Object.create(null);
  var links = Object.create(null);

  var fromX = 0, fromY = 0;
  var cachedPos = { x: 0, y: 0 },
      cachedFromPos = { x: 0, y: 0 },
      cachedToPos = { x: 0, y: 0 };

  var defaultUI = require('./defaultUI.js');
  var nodeBuilder = defaultUI.nodeBuilder,
    nodePositionCallback = defaultUI.nodePositionCallback,
    linkBuilder = defaultUI.linkBuilder,
    linkPositionCallback = defaultUI.linkPositionCallback;

  var currentTransform = {
    tx : 0,
    ty : 0,
    scale: 1
  };

  var api = {
    renderFrame: renderFrame,

    addNode: addNode,
    removeNode: removeNode,
    addLink: addLink,
    removeLink: removeLink,

    moveTo: moveTo,

    setNodeBuilder: setNodeBuilder,
    setLinkBuilder: setLinkBuilder,
    placeNode: function(newPlaceCallback) { nodePositionCallback = newPlaceCallback; },
    placeLink: function(newPlaceLinkCallback) { linkPositionCallback = newPlaceLinkCallback; }
  };

  return api;

  function renderFrame() {
    for (var nodeId in nodes) {
      var nodeInfo = nodes[nodeId];
      cachedPos.x = nodeInfo.pos.x;
      cachedPos.y = nodeInfo.pos.y;
      nodePositionCallback(nodeInfo.ui, cachedPos, nodeInfo.model);
    }

    for (var linkId in links) {
      var linkInfo = links[linkId];
      cachedFromPos.x = linkInfo.pos.from.x;
      cachedFromPos.y = linkInfo.pos.from.y;
      cachedToPos.x = linkInfo.pos.to.x;
      cachedToPos.y = linkInfo.pos.to.y;
      linkPositionCallback(linkInfo.ui, cachedToPos, cachedFromPos, linkInfo.model);
    }
  }

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

  function setNodeBuilder(builderCallback) {
    if (typeof builderCallback !== "function") throw new Error('node builder callback is supposed to be a function');

    nodeBuilder = builderCallback; // todo: rebuild all nodes?
  }

  function setLinkBuilder(builderCallback) {
    if (typeof builderCallback !== "function") throw new Error('link builder callback is supposed to be a function');

    linkBuilder = builderCallback; // todo: rebuild all nodes?
  }

  function addNode(node) {
    var ui = nodeBuilder(node);
    if (!ui) throw new Error('Node builder is supposed to return SVG object');

    nodeLayer.append(ui);

    var nodeDescriptor = {
      pos: layout.getNodePosition(node.id),
      model: node,
      ui: ui
    };

    ui.element.node = nodeDescriptor;

    nodeDescriptor.events = hammer(ui.element, NODE_MOVE_RECOGNIZER).on(MOVE_EVENTS, onNodePan);
    nodes[node.id] = nodeDescriptor;
  }

  function removeNode(node) {
    var descriptor = nodes[node.id];
    if (!descriptor) return;

    descriptor.events.off(MOVE_EVENTS);

    var parent = descriptor.ui.element.parentNode;
    if (parent) parent.removeChild(descriptor.ui.element);

    delete nodes[node.id];
  }


  function addLink(link) {
    var linkUI = linkBuilder(link);
    if (!linkUI) throw new Error('Link builder is supposed to return SVG object');

    links[link.id] = {
      pos: layout.getLinkPosition(link.id),
      model: link,
      ui: linkUI
    };

    linkLayer.append(linkUI);
  }

  function removeLink(link) {
    var descriptor = links[link.id];
    if (!descriptor) return;

    var parent = descriptor.ui.element.parentNode;
    if (parent) parent.removeChild(descriptor.ui.element);

    delete links[link.id];
  }

  function createSvgRoot(element) {
    if (element instanceof SVGSVGElement) return element;
    var svgRoot = svg("svg");
    element.appendChild(svgRoot.element);

    return svgRoot;
  }

  function createSceneRoot(svgRoot) {
    var scene = svg('g').attr("buffered-rendering", "dynamic");
    svgRoot.append(scene);

    hammer(svgRoot.element, SCENE_MOVE_RECOGNIZER)
      .on(MOVE_EVENTS, onScenePan);

    return scene;
  }

  function onScenePan(e) {
    if (e.target !== svgRoot.element || panNode > 0) return;
    if (e.type === 'panmove') {
      currentTransform.tx = fromX + e.deltaX;
      currentTransform.ty = fromY + e.deltaY;
      updateTransformMatrix();
    } else if (e.type === 'panstart') {
      fromX = currentTransform.tx;
      fromY = currentTransform.ty;
    }
  }

  function addLayer(name, parent) {
    var layer = svg('g').attr('id', name);
    parent.append(layer);
    return layer;
  }

  function onNodePan(e) {
    var node = e.target.node;
    var model = node.model;

    var clickPosition = getModelPosition(e.center);

    if (e.type === 'panmove') {
      var status = panSession[model.id];
      layout.setNodePosition(model.id, clickPosition.x - status.dx , clickPosition.y - status.dy);
    } else if (e.type === 'panstart') {
      panSession[model.id] = {
        isPinned: layout.isNodePinned(model),
        dx: clickPosition.x - node.pos.x,
        dy: clickPosition.y - node.pos.y
      };
      layout.pinNode(model, true);
      panNode += 1;
    } else if (e.type === 'panend') {
      layout.pinNode(model, panSession[model.id].isPinned);
      panNode -= 1;
    }
  }

  function getModelPosition(pos) {
    return {
      x: (pos.x - currentTransform.tx)/currentTransform.scale,
      y: (pos.y - currentTransform.ty)/currentTransform.scale,
    };
  }
}
