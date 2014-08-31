var merge = require('ngraph.merge');
var svg = require('simplesvg');

module.exports = function(graph, settings) {
  settings = merge(settings, {});

  var layout = getDefaultLayout(settings);

  var container = settings.container || document.body;
  var svgRoot = createSvgRoot(container);
  var scene = require('./lib/scene')(svgRoot, layout);

  var isStable = false;
  var disposed = false;
  var sceneInitialized = false;

  var api = {
    run: animationLoop,
    renderOneFrame: renderOneFrame,
    layout: layout,

    dispose: function() {
      layout.dispose();
      api.off();
      disposed = true;
      listenToGraphEvents(false);
      //listenToDomEvents(false);
    },

    node: setNodeBuilder,

    link: setLinkBuilder,

    placeNode: function(newPlaceCallback) {
      scene.placeNode(newPlaceCallback);
      return api;
    },

    placeLink: function(newPlaceLinkCallback) {
      scene.placeLink(newPlaceCallback);
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

    scene.renderFrame();
  }

  function getDefaultLayout(settings) {
    if (settings.layout) return settings.layout;

    settings = merge(settings, {
                  physics: {
                    springLength: 30,
                    springCoeff: 0.0008,
                    dragCoeff: 0.01,
                    gravity: -1.2,
                    theta: 1
                  }
                });
    var createLayout = require('ngraph.forcelayout');
    var physics = require('ngraph.physics.simulator');

    return createLayout(graph, physics(settings.physics));
  }

  function initializeScene() {
    sceneInitialized = true;

    graph.forEachNode(addNode);
    graph.forEachLink(addLink);

    scene.moveTo(container.clientWidth / 2, container.clientHeight / 2);

    listenToGraphEvents(true);
  }

  function addNode(node) { scene.addNode(node); }
  function removeNode(node) { scene.removeNode(node); }

  function setLinkBuilder(builderCallback) {
    scene.setLinkBuilder(builderCallback);
    return api;
  }

  function setNodeBuilder(builderCallback) {
    scene.setNodeBuilder(builderCallback);
    return api;
  }

  function addLink(link) { scene.addLink(link); }

  function removeLink(link) { scene.removeLink(link); }

  function listenToGraphEvents(isOn) {
    graph[isOn ? 'on' : 'off']('changed', onGraphChanged);
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

  function createSvgRoot(element) {
    if (element instanceof SVGSVGElement) return element;
    var svgRoot = svg("svg");
    element.appendChild(svgRoot.element);

    return svgRoot;
  }
};
