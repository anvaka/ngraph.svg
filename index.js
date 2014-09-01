module.exports = ngraphSvg;

function ngraphSvg(graph, settings) {
  settings = settings || {};

  var layout = require('./lib/defaultLayout.js')(graph, settings);

  var container = settings.container || document.body;

  var isStable = false;
  var disposed = false;
  var sceneInitialized = false;
  var scene = require('./lib/scene')(container, layout);

  var api = {
    run: animationLoop,
    renderOneFrame: renderOneFrame,
    layout: layout,

    dispose: dispose,

    node: setNodeBuilder,

    link: setLinkBuilder,

    placeNode: placeNode,

    placeLink: placeLink,

    svgRoot: scene.svgRoot
  };

  require('ngraph.events')(api);

  return api;

  function dispose() {
      layout.dispose();
      api.off();
      disposed = true;
      listenToGraphEvents(false);
      //listenToDomEvents(false);
    }

  function placeLink(newPlaceLinkCallback) {
    scene.placeLink(newPlaceLinkCallback);
    return api;
  }

  function placeNode(newPlaceCallback) {
    scene.placeNode(newPlaceCallback);
    return api;
  }

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

  function initializeScene() {
    graph.forEachNode(scene.addNode);
    graph.forEachLink(scene.addLink);

    scene.moveTo(container.clientWidth / 2, container.clientHeight / 2);

    listenToGraphEvents(true);
    sceneInitialized = true;
  }

  function setLinkBuilder(builderCallback) {
    scene.setLinkBuilder(builderCallback);
    return api;
  }

  function setNodeBuilder(builderCallback) {
    scene.setNodeBuilder(builderCallback);
    return api;
  }

  function listenToGraphEvents(isOn) {
    graph[isOn ? 'on' : 'off']('changed', onGraphChanged);
  }

  function onGraphChanged(changes) {
    resetStable();

    for (var i = 0; i < changes.length; ++i) {
      var change = changes[i];
      if (change.changeType === 'add') {
        if (change.node) {
          scene.addNode(change.node);
        }
        if (change.link) {
          scene.addLink(change.link);
        }
      } else if (change.changeType === 'remove') {
        if (change.node) {
          scene.removeNode(change.node);
        }
        if (change.link) {
          scene.removeLink(change.link);
        }
      }
    }
  }

  function resetStable() {
    isStable = false;
  }
}
