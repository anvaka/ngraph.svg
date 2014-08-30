var merge = require('ngraph.merge');
var svg = require('simplesvg');

module.exports = function(graph, settings) {
  settings = merge(settings, {
    physics: {
      springLength: 30,
      springCoeff: 0.0008,
      dragCoeff: 0.01,
      gravity: -1.2,
      theta: 1
    }
  });

  var svgRoot = getSvgRoot(settings.container || document.body);
  var elements = svg('g').attr("buffered-rendering", "dynamic");
  svgRoot.append(elements);

  var nodes = Object.create(null);
  var links = Object.create(null);

  var layout = getDefaultLayout();
  var isStable = false;
  var disposed = false;
  var sceneInitialized = false;
  var defaultUI = require('./lib/defaultUI.js');

  var nodeBuilder = defaultUI.nodeBuilder,
    nodePositionCallback = defaultUI.nodePositionCallback,
    linkBuilder = defaultUI.linkBuilder,
    linkPositionCallback = defaultUI.linkPositionCallback;

  var cachedPos = { x: 0, y: 0 },
    cachedFromPos = { x: 0, y: 0 },
    cachedToPos = { x: 0, y: 0 };

  var api = {
    run: animationLoop,
    renderOneFrame: renderOneFrame,
    layout: layout,

    dispose: function() {
      layout.dispose();
      api.off();
      disposed = true;
      //listenToGraphEvents(false);
      //listenToDomEvents(false);
    },

    node: setNodeBuilder,

    link: setLinkBuilder,

    placeNode: function(newPlaceCallback) {
      nodePositionCallback = newPlaceCallback;
      return api;
    },

    placeLink: function(newPlaceLinkCallback) {
      linkPositionCallback = newPlaceLinkCallback;
      return api;
    },
  };

  require('ngraph.events')(api);

  return api;

  function animationLoop() {
    if (disposed) return;
    requestAnimationFrame(animationLoop);

    if (!isStable) {
      nowStable = layout.step();
      renderOneFrame();
    }
  }

  function renderOneFrame() {
    if (disposed) return;
    if (!sceneInitialized) initializeScene();

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

  function getDefaultLayout() {
    if (settings.layout) return settings.layout;
    var createLayout = require('ngraph.forcelayout');
    var physics = require('ngraph.physics.simulator');
    return createLayout(graph, physics(settings.physics));
  }

  function initializeScene() {
    sceneInitialized = true;

    graph.forEachNode(addNode);
    graph.forEachLink(addLink);

    //var edgesUI = new vivasvg.ItemsControl();
    //edgesUI.setItemTemplate(_linkTemplate);
    //edgesUI.setItemSource(edges);
    //zoomer.appendChild(edgesUI);

    //nodesUI.setItemTemplate('<g transform="translate({{pos.x}}, {{pos.y}})" onmousedown="{{mousedown}}">' + _nodeTemplate + '</g>');
    //nodesUI.setItemSource(nodes);
    //zoomer.appendChild(nodesUI);

    //listenToGraphEvents(true);
    //listenToDomEvents(true);
  }

  function setNodeBuilder(builderCallback) {
    if (typeof builderCallback !== "function") throw new Error('node builder callback is supposed to be a function');

    nodeBuilder = builderCallback; // todo: rebuild all nodes?

    return api;
  }

  function addNode(node) {
    var nodeUI = nodeBuilder(node);
    if (!nodeUI) throw new Error('Node builder is supposed to return SVG object');

    nodes[node.id] = {
      pos: layout.getNodePosition(node.id),
      model: node,
      ui: nodeUI
    };

    elements.append(nodeUI);
  }

  function removeNode(node) {
    var descriptor = nodes[node.id];
    removeUI(descriptor && descriptor.ui);
    delete nodes[node.id];
  }

  function removeUI(ui) {
    if (!ui) return;
    // todo: implement me
  }

  function onMouseUp(e) {
    if (draggingNode) {
      var node = draggingNode.node;
      layout.pinNode(node, draggingNode.wasPinned);
    }
    draggingNode = null;
  }

  function onMouseDownNode(e, model) {
    draggingNode = model;

    draggingNode.wasPinned = layout.isNodePinned(model.node);
    layout.pinNode(model.node, true);
    var pos = zoomer.getModelPosition(e.clientX, e.clientY);
    dragNodeDx = pos.x - model.pos.x;
    dragNodeDy = pos.y - model.pos.y;
    e.stopPropagation();
    api.fire('nodeSelected', model.node);
  }

  function onMouseMove(e) {
    if (!draggingNode) return;
    resetStable();

    var pos = zoomer.getModelPosition(e.clientX, e.clientY);
    layout.setNodePosition(draggingNode.id, pos.x - dragNodeDx, pos.y - dragNodeDy);
    notifyNodePositionChange(draggingNode);
    e.stopPropagation();
    e.preventDefault();
  }

  function setLinkBuilder(builderCallback) {
    if (typeof builderCallback !== "function") throw new Error('link builder should be a function');

    linkBuilder = builderCallback;
    return api;
  }

  function addLink(link) {
    var linkUI = linkBuilder(link);
    if (!linkUI) throw new Error('Link builder is supposed to return SVG object');

    links[link.id] = {
      pos: layout.getLinkPosition(link.id),
      model: link,
      ui: linkUI
    };

    elements.append(linkUI);
  }

  function removeLink(link) {
    var descriptor = links[link.id];
    removeUI(descriptor && descriptor.ui);
    delete links[link.id];
  }

  function listenToGraphEvents(isOn) {
    graph[isOn ? 'on' : 'off']('changed', onGraphChanged);
  }

  function listenToDomEvents(isOn) {
    var visual = svgDoc.getVisual();
    var method = isOn ? 'addEventListener' : 'removeEventListener';
    visual[method]('mousemove', onMouseMove);
    visual[method]('mouseup', onMouseUp);
  }

  function onGraphChanged(changes) {
    resetStable();

    for (var i = 0; i < changes.length; ++i) {
      var change = changes[i];
      if (change.changeType === 'add') {
        if (change.node) {
          addNode(change.node);
        }
        if (change.link) {
          addLink(change.link);
        }
      } else if (change.changeType === 'remove') {
        if (change.node) {
          removeNode(change.node);
        }
        if (change.link) {
          removeLink(change.link);
        }
      }
    }
  }

  function resetStable() {
    isStable = false;
  }

  function getSvgRoot(element) {
    if (element instanceof SVGSVGElement) return element;
    var svgRoot = svg("svg");
    element.appendChild(svgRoot.element);

    return svgRoot;
  }
};
