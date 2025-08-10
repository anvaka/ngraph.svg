import svg from 'simplesvg';
import Hammer from 'hammerjs';
import getDefaultLayout from './lib/defaultLayout.js';
import {
  nodeBuilder as defaultNodeBuilder,
  nodePositionCallback as defaultNodePositionCallback,
  linkBuilder as defaultLinkBuilder,
  linkPositionCallback as defaultLinkPositionCallback,
} from './lib/defaultUI.js';
import mixinEvents from 'ngraph.events';

const MOVE_EVENTS = 'panstart panmove panend';

// default export; we'll also attach a static `svg` helper below for convenience
export default ngraphSvg;

function ngraphSvg(graph, settings) {
  settings = settings || {};

  const layout = getDefaultLayout(graph, settings);

  const scrollSpeed = typeof settings.scrollSpeed === 'number' ?
      settings.scrollSpeed : 0.1;
  const container = settings.container || document.body;

  let isStable = false;
  let disposed = false;
  let sceneInitialized = false;

  const svgRoot = createSvgRoot(container);
  const sceneRoot = createSceneRoot(svgRoot);
  const sceneTransform = createSceneTransform(sceneRoot);
  const panSession = {};
  let panNode = 0;

  const linkLayer = addLayer('links', sceneRoot);
  const nodeLayer = addLayer('nodes', sceneRoot);

  const nodes = Object.create(null);
  const links = Object.create(null);

  let fromX = 0, fromY = 0;
  let screenPinchX, screenPinchY, lastScale;
  const cachedPos = { x: 0, y: 0 },
    cachedFromPos = { x: 0, y: 0 },
    cachedToPos = { x: 0, y: 0 };

  let nodeBuilder = defaultNodeBuilder,
    nodePositionCallback = defaultNodePositionCallback,
    linkBuilder = defaultLinkBuilder,
    linkPositionCallback = defaultLinkPositionCallback;

  const currentTransform = {
    tx : 0,
    ty : 0,
    scale: 1
  };

  const api = {
    run: animationLoop,
    renderOneFrame: renderOneFrame,
    layout: layout,

    dispose: dispose,

    node: setNodeBuilder,

    link: setLinkBuilder,

    placeNode: placeNode,

    placeLink: placeLink,

    svgRoot: svgRoot,

    resetStable: resetStable
  };

  // Mixin simple emitter (CJS -> ESM interop is handled by bundler)
  mixinEvents(api);

  return api;

  function dispose() {
    layout.dispose();
    api.off();
    disposed = true;
    listenToGraphEvents(false);
    releaseDOMEvents();
  }

  function placeLink(newPlaceLinkCallback) {
    linkPositionCallback = newPlaceLinkCallback;
    return api;
  }

  function placeNode(newPlaceCallback) {
    nodePositionCallback = newPlaceCallback;
    return api;
  }

  function animationLoop() {
    if (disposed) return;
    requestAnimationFrame(animationLoop);

    if (!isStable) {
      layout.step();
      renderOneFrame();
    }
  }

  function renderOneFrame() {
    if (disposed) return;
    if (!sceneInitialized) initializeScene();

    for (const nodeId in nodes) {
      const nodeInfo = nodes[nodeId];
      cachedPos.x = nodeInfo.pos.x;
      cachedPos.y = nodeInfo.pos.y;
      nodePositionCallback(nodeInfo.ui, cachedPos, nodeInfo.model);
    }

    for (const linkId in links) {
      const linkInfo = links[linkId];
      cachedFromPos.x = linkInfo.pos.from.x;
      cachedFromPos.y = linkInfo.pos.from.y;
      cachedToPos.x = linkInfo.pos.to.x;
      cachedToPos.y = linkInfo.pos.to.y;
      linkPositionCallback(linkInfo.ui, cachedFromPos, cachedToPos, linkInfo.model);
    }
  }

  function initializeScene() {
    graph.forEachNode(addNode);
    graph.forEachLink(addLink);

    moveTo(container.clientWidth / 2, container.clientHeight / 2);

    listenToGraphEvents(true);
    sceneInitialized = true;
  }

  function addLink(link) {
    const linkUI = linkBuilder(link);
    if (!linkUI) throw new Error('Link builder is supposed to return SVG object');

    links[link.id] = {
      pos: layout.getLinkPosition(link.id),
      model: link,
      ui: linkUI
    };

    linkLayer.append(linkUI);
  }

  function addNode(node) {
    const ui = nodeBuilder(node);
    if (!ui) throw new Error('Node builder is supposed to return SVG object');

    nodeLayer.append(ui);

    const pos = layout.getNodePosition(node.id);
    const nodeDescriptor = {
      pos: pos,
      model: node,
      ui: ui
    };

    const recognizers = { recognizers: [
      [Hammer.Pan, { threshold: 1 }]
    ] };
    nodeDescriptor.events = Hammer(ui, recognizers).on(MOVE_EVENTS, onNodePan(pos, node));
    nodes[node.id] = nodeDescriptor;
  }

  function setLinkBuilder(builderCallback) {
    if (typeof builderCallback !== "function") throw new Error('link builder callback is supposed to be a function');

    linkBuilder = builderCallback; // todo: rebuild all nodes?
    return api;
  }

  function setNodeBuilder(builderCallback) {
    if (typeof builderCallback !== "function") throw new Error('node builder callback is supposed to be a function');

    nodeBuilder = builderCallback; // todo: rebuild all nodes?
    return api;
  }

  function listenToGraphEvents(isOn) {
    graph[isOn ? 'on' : 'off']('changed', onGraphChanged);
  }

  function onGraphChanged(changes) {
    resetStable();

    for (let i = 0; i < changes.length; ++i) {
      const change = changes[i];
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
    const svgRoot = svg("svg");
    element.appendChild(svgRoot);

    return svgRoot;
  }

  function createSceneRoot(svgRoot) {
    const scene = svg('g').attr("buffered-rendering", "dynamic");
    svgRoot.append(scene);

    const sceneMoveRecognizer = { recognizers: [
      [Hammer.Pan, { threshold: 1 }],
      [Hammer.Pinch, { enable: true }]
    ] };

    // somehow ios does not fire events on svg. Use body instead:
  Hammer(container, sceneMoveRecognizer)
      .on(MOVE_EVENTS, onScenePan)
      .on('pinchstart pinchin pinchout', onScreenPinch);

  // Use native wheel listener instead of the deprecated 'wheel' package
  // Note: passive: false so we can call preventDefault() for zooming.
  svgRoot.addEventListener('wheel', onWheel, { passive: false });
    return scene;
  }


  function onScenePan(e) {
    if (e.target !== svgRoot || panNode > 0) return;
    if (e.type === 'panmove') {
      currentTransform.tx = fromX + e.deltaX;
      currentTransform.ty = fromY + e.deltaY;
      updateTransformMatrix();
    } else if (e.type === 'panstart') {
      fromX = currentTransform.tx;
      fromY = currentTransform.ty;
    }
  }

  function onWheel(e) {
    const isZoomIn = e.deltaY < 0;
    const direction = isZoomIn ? 1 : -1;
    const factor = (1 + direction * scrollSpeed);
    const x = e.offsetX === undefined ? e.layerX : e.offsetX;
    const y = e.offsetY === undefined ? e.layerY : e.offsetY;
    zoomTo(x, y, factor);
    e.preventDefault();
  }

  function zoomTo(x, y, factor) {
    currentTransform.tx = x - factor * (x - currentTransform.tx);
    currentTransform.ty = y - factor * (y - currentTransform.ty);
    currentTransform.scale *= factor;
    updateTransformMatrix();
  }


  function addLayer(name, parent) {
    const layer = svg('g').attr('id', name);
    parent.append(layer);
    return layer;
  }


  function getModelPosition(pos) {
    return {
      x: (pos.x - currentTransform.tx)/currentTransform.scale,
      y: (pos.y - currentTransform.ty)/currentTransform.scale,
    };
  }
  function createSceneTransform(scene) {
    const transform = svgRoot.createSVGTransform();
    scene.transform.baseVal.appendItem(transform);

    return transform;
  }

  function moveTo(x, y) {
    currentTransform.tx = x;
    currentTransform.ty = y;
    updateTransformMatrix();
  }

  function updateTransformMatrix() {
    sceneTransform.matrix.e = currentTransform.tx;
    sceneTransform.matrix.f = currentTransform.ty;
    sceneTransform.matrix.a = sceneTransform.matrix.d = currentTransform.scale;
  }

  function onNodePan(pos, model) {
    return function onNodePan(e) {
      const clickPosition = getModelPosition(e.center);
      let status;
      resetStable();

      if (e.type === 'panmove') {
        status = panSession[model.id];
        layout.setNodePosition(model.id, clickPosition.x - status.dx , clickPosition.y - status.dy);
      } else if (e.type === 'panstart') {
        panSession[model.id] = {
          isPinned: layout.isNodePinned(model),
          dx: clickPosition.x - pos.x,
          dy: clickPosition.y - pos.y
        };
        layout.pinNode(model, true);
        panNode += 1;
      } else if (e.type === 'panend') {
        status = panSession[model.id];
        if (status) layout.pinNode(model, status.isPinned);

        panNode -= 1;
        if (panNode < 0) panNode = 0;
      }
    };
  }

  function releaseDOMEvents() {
    for (const key in nodes) {
      const descriptor = nodes[key];
      if (descriptor.events) descriptor.events.destroy();
    }
  }

  function removeNode(node) {
    const descriptor = nodes[node.id];
    if (!descriptor) return;

    descriptor.events.destroy();

    const parent = descriptor.ui.parentNode;
    if (parent) parent.removeChild(descriptor.ui);

    delete nodes[node.id];
  }

  function removeLink(link) {
    const descriptor = links[link.id];
    if (!descriptor) return;

    const parent = descriptor.ui.parentNode;
    if (parent) parent.removeChild(descriptor.ui);

    delete links[link.id];
  }


  function onScreenPinch(e) {
    if (e.target !== svgRoot) return;

    if (e.type === 'pinchstart') {
      screenPinchX = e.center.x;
      screenPinchY = e.center.y;
      lastScale = e.scale;
    } else {
      const direction = lastScale > e.scale ? -1 : 1;
      lastScale = e.scale;
      const factor = (1 + direction * 0.04);
      zoomTo(screenPinchX, screenPinchY, factor);
    }
  }
}

// Attach convenience helper for consumers who expect `createRenderer.svg`
// Note: In ESM, exported binding is the function below after assignment
// Rollup/Vite preserve function object identity allowing property attachment
ngraphSvg.svg = svg;
