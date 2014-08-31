(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var graph = require('ngraph.graph')();
graph.addLink(0, 1);

var renderer = require('../../')(graph);
renderer.run();

},{"../../":2,"ngraph.graph":23}],2:[function(require,module,exports){
module.exports = ngraphSvg;

function ngraphSvg(graph, settings) {
  settings = settings || {};

  var layout = require('./lib/defaultLayout.js')(graph, settings);

  var container = settings.container || document.body;
  var scene = require('./lib/scene')(container, layout);

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

},{"./lib/defaultLayout.js":3,"./lib/scene":5,"ngraph.events":7}],3:[function(require,module,exports){
var merge = require('ngraph.merge');

module.exports = getDefaultLayout;

function getDefaultLayout(graph, settings) {
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

},{"ngraph.forcelayout":8,"ngraph.merge":25,"ngraph.physics.simulator":26}],4:[function(require,module,exports){
var svg = require('simplesvg');

exports.nodeBuilder = nodeBuilder;
exports.nodePositionCallback = nodePositionCallback;
exports.linkBuilder = linkBuilder;
exports.linkPositionCallback = linkPositionCallback;

function nodeBuilder(node) {
  return svg("rect")
    .attr("width", 10)
    .attr("height", 10)
    .attr("fill", "#00a2e8");
}

function nodePositionCallback(nodeUI, pos) {
  nodeUI.attr("x", pos.x - 5).attr("y", pos.y - 5);
}

function linkBuilder(linkUI, pos) {
  return svg("line").attr("stroke", "#999");
}

function linkPositionCallback(linkUI, fromPos, toPos) {
  linkUI.attr("x1", fromPos.x)
    .attr("y1", fromPos.y)
    .attr("x2", toPos.x)
    .attr("y2", toPos.y);
}

},{"simplesvg":40}],5:[function(require,module,exports){
var svg = require('simplesvg');
var hammer = require('hammerjs');

module.exports = scene;

var MOVE_EVENTS = 'panstart panmove panend';

function scene(container, layout) {
  var svgRoot = createSvgRoot(container);
  var sceneRoot = createSceneRoot(svgRoot);
  var sceneTransform = createSceneTransform(sceneRoot);
  var panSession = {};
  var panNode = 0;

  var linkLayer = addLayer('links', sceneRoot);
  var nodeLayer = addLayer('nodes', sceneRoot);

  var nodes = Object.create(null);
  var links = Object.create(null);

  var fromX = 0, fromY = 0;
  var screenPinchX, screenPinchY, lastScale;
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
    zoomTo: zoomTo,

    setNodeBuilder: setNodeBuilder,
    setLinkBuilder: setLinkBuilder,
    placeNode: function(newPlaceCallback) { nodePositionCallback = newPlaceCallback; },
    placeLink: function(newPlaceLinkCallback) { linkPositionCallback = newPlaceLinkCallback; },

    dispose: dispose
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
    var transform = svgRoot.createSVGTransform();
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

    var pos = layout.getNodePosition(node.id);
    var nodeDescriptor = {
      pos: pos,
      model: node,
      ui: ui
    };

    var recognizers = { recognizers:[ [hammer.Pan, { threshold: 1 }]] };
    nodeDescriptor.events = hammer(ui, recognizers).on(MOVE_EVENTS, onNodePan(pos, node));
    nodes[node.id] = nodeDescriptor;

  }

  function onNodePan(pos, model) {
    return function onNodePan(e) {
      var clickPosition = getModelPosition(e.center);

      if (e.type === 'panmove') {
        var status = panSession[model.id];
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
        layout.pinNode(model, panSession[model.id].isPinned);
        panNode -= 1;
      }
    };
  }

  function removeNode(node) {
    var descriptor = nodes[node.id];
    if (!descriptor) return;

    descriptor.events.off(MOVE_EVENTS);

    var parent = descriptor.ui.parentNode;
    if (parent) parent.removeChild(descriptor.ui);

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

    var parent = descriptor.ui.parentNode;
    if (parent) parent.removeChild(descriptor.ui);

    delete links[link.id];
  }

  function createSvgRoot(element) {
    if (element instanceof SVGSVGElement) return element;
    var svgRoot = svg("svg");
    element.appendChild(svgRoot);

    return svgRoot;
  }

  function createSceneRoot(svgRoot) {
    var scene = svg('g').attr("buffered-rendering", "dynamic");
    svgRoot.append(scene);

    var sceneMoveRecognizer = { recognizers: [
      [hammer.Pan, { threshold: 1 }],
      [hammer.Pinch, { enable: true }]
    ] };

    // somehow ios does not fire events on svg. Use body instead:
    hammer(document.body, sceneMoveRecognizer)
      .on(MOVE_EVENTS, onScenePan)
      .on('pinchstart pinchin pinchout', onScreenPinch);

    var addWheelListener = require('wheel');
    addWheelListener(svgRoot, onWheel);
    return scene;
  }

  function onScreenPinch(e) {
    if (e.target !== svgRoot) return;

    if (e.type === 'pinchstart') {
      screenPinchX = e.center.x;
      screenPinchY = e.center.y;
      lastScale = e.scale;
    } else {
      var direction = lastScale > e.scale ? -1 : 1;
      lastScale = e.scale;
      var factor = (1 + direction * 0.04);
      zoomTo(screenPinchX, screenPinchY, factor);
    }
  }

  function onWheel(e) {
    var isZoomIn = e.deltaY < 0;
    var direction = isZoomIn ? 1 : -1;
    var factor = (1 + direction * 0.1);
    zoomTo(e.clientX, e.clientY, factor);
  }

  function zoomTo(x, y, factor) {
    currentTransform.tx = x - factor * (x - currentTransform.tx);
    currentTransform.ty = y - factor * (y - currentTransform.ty);
    currentTransform.scale *= factor;
    updateTransformMatrix();
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

  function addLayer(name, parent) {
    var layer = svg('g').attr('id', name);
    parent.append(layer);
    return layer;
  }


  function getModelPosition(pos) {
    return {
      x: (pos.x - currentTransform.tx)/currentTransform.scale,
      y: (pos.y - currentTransform.ty)/currentTransform.scale,
    };
  }

  function dispose() {
    // todo: implement me:
    // 1. scene hammer
    // 2. scene mouse wheel
  }
}

},{"./defaultUI.js":4,"hammerjs":6,"simplesvg":40,"wheel":42}],6:[function(require,module,exports){
(function(window, document, exportName, undefined) {
  'use strict';

var VENDOR_PREFIXES = ['', 'webkit', 'moz', 'MS', 'ms', 'o'];
var TEST_ELEMENT = document.createElement('div');

var TYPE_FUNCTION = 'function';

var round = Math.round;
var abs = Math.abs;
var now = Date.now;

/**
 * set a timeout with a given scope
 * @param {Function} fn
 * @param {Number} timeout
 * @param {Object} context
 * @returns {number}
 */
function setTimeoutContext(fn, timeout, context) {
    return setTimeout(bindFn(fn, context), timeout);
}

/**
 * if the argument is an array, we want to execute the fn on each entry
 * if it aint an array we don't want to do a thing.
 * this is used by all the methods that accept a single and array argument.
 * @param {*|Array} arg
 * @param {String} fn
 * @param {Object} [context]
 * @returns {Boolean}
 */
function invokeArrayArg(arg, fn, context) {
    if (Array.isArray(arg)) {
        each(arg, context[fn], context);
        return true;
    }
    return false;
}

/**
 * walk objects and arrays
 * @param {Object} obj
 * @param {Function} iterator
 * @param {Object} context
 */
function each(obj, iterator, context) {
    var i, len;

    if (!obj) {
        return;
    }

    if (obj.forEach) {
        obj.forEach(iterator, context);
    } else if (obj.length !== undefined) {
        for (i = 0, len = obj.length; i < len; i++) {
            iterator.call(context, obj[i], i, obj);
        }
    } else {
        for (i in obj) {
            obj.hasOwnProperty(i) && iterator.call(context, obj[i], i, obj);
        }
    }
}

/**
 * extend object.
 * means that properties in dest will be overwritten by the ones in src.
 * @param {Object} dest
 * @param {Object} src
 * @param {Boolean} [merge]
 * @returns {Object} dest
 */
function extend(dest, src, merge) {
    var keys = Object.keys(src);
    for (var i = 0, len = keys.length; i < len; i++) {
        if (!merge || (merge && dest[keys[i]] === undefined)) {
            dest[keys[i]] = src[keys[i]];
        }
    }
    return dest;
}

/**
 * merge the values from src in the dest.
 * means that properties that exist in dest will not be overwritten by src
 * @param {Object} dest
 * @param {Object} src
 * @returns {Object} dest
 */
function merge(dest, src) {
    return extend(dest, src, true);
}

/**
 * simple class inheritance
 * @param {Function} child
 * @param {Function} base
 * @param {Object} [properties]
 */
function inherit(child, base, properties) {
    var baseP = base.prototype,
        childP;

    childP = child.prototype = Object.create(baseP);
    childP.constructor = child;
    childP._super = baseP;

    if (properties) {
        extend(childP, properties);
    }
}

/**
 * simple function bind
 * @param {Function} fn
 * @param {Object} context
 * @returns {Function}
 */
function bindFn(fn, context) {
    return function boundFn() {
        return fn.apply(context, arguments);
    };
}

/**
 * let a boolean value also be a function that must return a boolean
 * this first item in args will be used as the context
 * @param {Boolean|Function} val
 * @param {Array} [args]
 * @returns {Boolean}
 */
function boolOrFn(val, args) {
    if (typeof val == TYPE_FUNCTION) {
        return val.apply(args ? args[0] || undefined : undefined, args);
    }
    return val;
}

/**
 * use the val2 when val1 is undefined
 * @param {*} val1
 * @param {*} val2
 * @returns {*}
 */
function ifUndefined(val1, val2) {
    return (val1 === undefined) ? val2 : val1;
}

/**
 * addEventListener with multiple events at once
 * @param {HTMLElement} element
 * @param {String} types
 * @param {Function} handler
 */
function addEventListeners(element, types, handler) {
    each(splitStr(types), function(type) {
        element.addEventListener(type, handler, false);
    });
}

/**
 * removeEventListener with multiple events at once
 * @param {HTMLElement} element
 * @param {String} types
 * @param {Function} handler
 */
function removeEventListeners(element, types, handler) {
    each(splitStr(types), function(type) {
        element.removeEventListener(type, handler, false);
    });
}

/**
 * find if a node is in the given parent
 * @method hasParent
 * @param {HTMLElement} node
 * @param {HTMLElement} parent
 * @return {Boolean} found
 */
function hasParent(node, parent) {
    while (node) {
        if (node == parent) {
            return true;
        }
        node = node.parentNode;
    }
    return false;
}

/**
 * small indexOf wrapper
 * @param {String} str
 * @param {String} find
 * @returns {Boolean} found
 */
function inStr(str, find) {
    return str.indexOf(find) > -1;
}

/**
 * split string on whitespace
 * @param {String} str
 * @returns {Array} words
 */
function splitStr(str) {
    return str.trim().split(/\s+/g);
}

/**
 * find if a array contains the object using indexOf or a simple polyFill
 * @param {Array} src
 * @param {String} find
 * @param {String} [findByKey]
 * @return {Boolean|Number} false when not found, or the index
 */
function inArray(src, find, findByKey) {
    if (src.indexOf && !findByKey) {
        return src.indexOf(find);
    } else {
        for (var i = 0, len = src.length; i < len; i++) {
            if ((findByKey && src[i][findByKey] == find) || (!findByKey && src[i] === find)) {
                return i;
            }
        }
        return -1;
    }
}

/**
 * convert array-like objects to real arrays
 * @param {Object} obj
 * @returns {Array}
 */
function toArray(obj) {
    return Array.prototype.slice.call(obj, 0);
}

/**
 * unique array with objects based on a key (like 'id') or just by the array's value
 * @param {Array} src [{id:1},{id:2},{id:1}]
 * @param {String} [key]
 * @param {Boolean} [sort=False]
 * @returns {Array} [{id:1},{id:2}]
 */
function uniqueArray(src, key, sort) {
    var results = [];
    var values = [];
    for (var i = 0, len = src.length; i < len; i++) {
        var val = key ? src[i][key] : src[i];
        if (inArray(values, val) < 0) {
            results.push(src[i]);
        }
        values[i] = val;
    }

    if (sort) {
        if (!key) {
            results = results.sort();
        } else {
            results = results.sort(function sortUniqueArray(a, b) {
                return a[key] > b[key];
            });
        }
    }

    return results;
}

/**
 * get the prefixed property
 * @param {Object} obj
 * @param {String} property
 * @returns {String|Undefined} prefixed
 */
function prefixed(obj, property) {
    var prefix, prop;
    var camelProp = property[0].toUpperCase() + property.slice(1);

    for (var i = 0, len = VENDOR_PREFIXES.length; i < len; i++) {
        prefix = VENDOR_PREFIXES[i];
        prop = (prefix) ? prefix + camelProp : property;

        if (prop in obj) {
            return prop;
        }
    }
    return undefined;
}

/**
 * get a unique id
 * @returns {number} uniqueId
 */
var _uniqueId = 1;
function uniqueId() {
    return _uniqueId++;
}

var MOBILE_REGEX = /mobile|tablet|ip(ad|hone|od)|android/i;

var SUPPORT_TOUCH = ('ontouchstart' in window);
var SUPPORT_POINTER_EVENTS = prefixed(window, 'PointerEvent') !== undefined;
var SUPPORT_ONLY_TOUCH = SUPPORT_TOUCH && MOBILE_REGEX.test(navigator.userAgent);

var INPUT_TYPE_TOUCH = 'touch';
var INPUT_TYPE_PEN = 'pen';
var INPUT_TYPE_MOUSE = 'mouse';
var INPUT_TYPE_KINECT = 'kinect';

var COMPUTE_INTERVAL = 25;

var INPUT_START = 1;
var INPUT_MOVE = 2;
var INPUT_END = 4;
var INPUT_CANCEL = 8;

var DIRECTION_NONE = 1;
var DIRECTION_LEFT = 2;
var DIRECTION_RIGHT = 4;
var DIRECTION_UP = 8;
var DIRECTION_DOWN = 16;

var DIRECTION_HORIZONTAL = DIRECTION_LEFT | DIRECTION_RIGHT;
var DIRECTION_VERTICAL = DIRECTION_UP | DIRECTION_DOWN;
var DIRECTION_ALL = DIRECTION_HORIZONTAL | DIRECTION_VERTICAL;

var PROPS_XY = ['x', 'y'];
var PROPS_CLIENT_XY = ['clientX', 'clientY'];

/**
 * create new input type manager
 * @param {Manager} manager
 * @param {Function} callback
 * @returns {Input}
 * @constructor
 */
function Input(manager, callback) {
    var self = this;
    this.manager = manager;
    this.callback = callback;
    this.element = manager.element;
    this.target = manager.options.inputTarget;

    // smaller wrapper around the handler, for the scope and the enabled state of the manager,
    // so when disabled the input events are completely bypassed.
    this.domHandler = function(ev) {
        if (boolOrFn(manager.options.enable, [manager])) {
            self.handler(ev);
        }
    };

    this.evEl && addEventListeners(this.element, this.evEl, this.domHandler);
    this.evTarget && addEventListeners(this.target, this.evTarget, this.domHandler);
    this.evWin && addEventListeners(window, this.evWin, this.domHandler);
}

Input.prototype = {
    /**
     * should handle the inputEvent data and trigger the callback
     * @virtual
     */
    handler: function() { },

    /**
     * unbind the events
     */
    destroy: function() {
        this.evEl && removeEventListeners(this.element, this.evEl, this.domHandler);
        this.evTarget && removeEventListeners(this.target, this.evTarget, this.domHandler);
        this.evWin && removeEventListeners(window, this.evWin, this.domHandler);
    }
};

/**
 * create new input type manager
 * @param {Hammer} manager
 * @returns {Input}
 */
function createInputInstance(manager) {
    var Type;
    if (SUPPORT_POINTER_EVENTS) {
        Type = PointerEventInput;
    } else if (SUPPORT_ONLY_TOUCH) {
        Type = TouchInput;
    } else if (!SUPPORT_TOUCH) {
        Type = MouseInput;
    } else {
        Type = TouchMouseInput;
    }
    return new (Type)(manager, inputHandler);
}

/**
 * handle input events
 * @param {Manager} manager
 * @param {String} eventType
 * @param {Object} input
 */
function inputHandler(manager, eventType, input) {
    var pointersLen = input.pointers.length;
    var changedPointersLen = input.changedPointers.length;
    var isFirst = (eventType & INPUT_START && (pointersLen - changedPointersLen === 0));
    var isFinal = (eventType & (INPUT_END | INPUT_CANCEL) && (pointersLen - changedPointersLen === 0));

    input.isFirst = !!isFirst;
    input.isFinal = !!isFinal;

    if (isFirst) {
        manager.session = {};
    }

    // source event is the normalized value of the domEvents
    // like 'touchstart, mouseup, pointerdown'
    input.eventType = eventType;

    // compute scale, rotation etc
    computeInputData(manager, input);

    // emit secret event
    manager.emit('hammer.input', input);

    manager.recognize(input);
    manager.session.prevInput = input;
}

/**
 * extend the data with some usable properties like scale, rotate, velocity etc
 * @param {Object} manager
 * @param {Object} input
 */
function computeInputData(manager, input) {
    var session = manager.session;
    var pointers = input.pointers;
    var pointersLength = pointers.length;

    // store the first input to calculate the distance and direction
    if (!session.firstInput) {
        session.firstInput = simpleCloneInputData(input);
    }

    // to compute scale and rotation we need to store the multiple touches
    if (pointersLength > 1 && !session.firstMultiple) {
        session.firstMultiple = simpleCloneInputData(input);
    } else if (pointersLength === 1) {
        session.firstMultiple = false;
    }

    var firstInput = session.firstInput;
    var firstMultiple = session.firstMultiple;
    var offsetCenter = firstMultiple ? firstMultiple.center : firstInput.center;

    var center = input.center = getCenter(pointers);
    input.timeStamp = now();
    input.deltaTime = input.timeStamp - firstInput.timeStamp;

    input.angle = getAngle(offsetCenter, center);
    input.distance = getDistance(offsetCenter, center);

    computeDeltaXY(session, input);
    input.offsetDirection = getDirection(input.deltaX, input.deltaY);

    input.scale = firstMultiple ? getScale(firstMultiple.pointers, pointers) : 1;
    input.rotation = firstMultiple ? getRotation(firstMultiple.pointers, pointers) : 0;

    computeIntervalInputData(session, input);

    // find the correct target
    var target = manager.element;
    if (hasParent(input.srcEvent.target, target)) {
        target = input.srcEvent.target;
    }
    input.target = target;
}

function computeDeltaXY(session, input) {
    var center = input.center;
    var offset = session.offsetDelta || {};
    var prevDelta = session.prevDelta || {};
    var prevInput = session.prevInput || {};

    if (input.eventType === INPUT_START || prevInput.eventType === INPUT_END) {
        prevDelta = session.prevDelta = {
            x: prevInput.deltaX || 0,
            y: prevInput.deltaY || 0
        };

        offset = session.offsetDelta = {
            x: center.x,
            y: center.y
        };
    }

    input.deltaX = prevDelta.x + (center.x - offset.x);
    input.deltaY = prevDelta.y + (center.y - offset.y);
}

/**
 * velocity is calculated every x ms
 * @param {Object} session
 * @param {Object} input
 */
function computeIntervalInputData(session, input) {
    var last = session.lastInterval || input,
        deltaTime = input.timeStamp - last.timeStamp,
        velocity, velocityX, velocityY, direction;

    if (input.eventType != INPUT_CANCEL && (deltaTime > COMPUTE_INTERVAL || last.velocity === undefined)) {
        var deltaX = last.deltaX - input.deltaX;
        var deltaY = last.deltaY - input.deltaY;

        var v = getVelocity(deltaTime, deltaX, deltaY);
        velocityX = v.x;
        velocityY = v.y;
        velocity = (abs(v.x) > abs(v.y)) ? v.x : v.y;
        direction = getDirection(deltaX, deltaY);

        session.lastInterval = input;
    } else {
        // use latest velocity info if it doesn't overtake a minimum period
        velocity = last.velocity;
        velocityX = last.velocityX;
        velocityY = last.velocityY;
        direction = last.direction;
    }

    input.velocity = velocity;
    input.velocityX = velocityX;
    input.velocityY = velocityY;
    input.direction = direction;
}

/**
 * create a simple clone from the input used for storage of firstInput and firstMultiple
 * @param {Object} input
 * @returns {Object} clonedInputData
 */
function simpleCloneInputData(input) {
    // make a simple copy of the pointers because we will get a reference if we don't
    // we only need clientXY for the calculations
    var pointers = [];
    for (var i = 0; i < input.pointers.length; i++) {
        pointers[i] = {
            clientX: round(input.pointers[i].clientX),
            clientY: round(input.pointers[i].clientY)
        };
    }

    return {
        timeStamp: now(),
        pointers: pointers,
        center: getCenter(pointers),
        deltaX: input.deltaX,
        deltaY: input.deltaY
    };
}

/**
 * get the center of all the pointers
 * @param {Array} pointers
 * @return {Object} center contains `x` and `y` properties
 */
function getCenter(pointers) {
    var pointersLength = pointers.length;

    // no need to loop when only one touch
    if (pointersLength === 1) {
        return {
            x: round(pointers[0].clientX),
            y: round(pointers[0].clientY)
        };
    }

    var x = 0, y = 0;
    for (var i = 0; i < pointersLength; i++) {
        x += pointers[i].clientX;
        y += pointers[i].clientY;
    }

    return {
        x: round(x / pointersLength),
        y: round(y / pointersLength)
    };
}

/**
 * calculate the velocity between two points. unit is in px per ms.
 * @param {Number} deltaTime
 * @param {Number} x
 * @param {Number} y
 * @return {Object} velocity `x` and `y`
 */
function getVelocity(deltaTime, x, y) {
    return {
        x: x / deltaTime || 0,
        y: y / deltaTime || 0
    };
}

/**
 * get the direction between two points
 * @param {Number} x
 * @param {Number} y
 * @return {Number} direction
 */
function getDirection(x, y) {
    if (x === y) {
        return DIRECTION_NONE;
    }

    if (abs(x) >= abs(y)) {
        return x > 0 ? DIRECTION_LEFT : DIRECTION_RIGHT;
    }
    return y > 0 ? DIRECTION_UP : DIRECTION_DOWN;
}

/**
 * calculate the absolute distance between two points
 * @param {Object} p1 {x, y}
 * @param {Object} p2 {x, y}
 * @param {Array} [props] containing x and y keys
 * @return {Number} distance
 */
function getDistance(p1, p2, props) {
    if (!props) {
        props = PROPS_XY;
    }
    var x = p2[props[0]] - p1[props[0]],
        y = p2[props[1]] - p1[props[1]];

    return Math.sqrt((x * x) + (y * y));
}

/**
 * calculate the angle between two coordinates
 * @param {Object} p1
 * @param {Object} p2
 * @param {Array} [props] containing x and y keys
 * @return {Number} angle
 */
function getAngle(p1, p2, props) {
    if (!props) {
        props = PROPS_XY;
    }
    var x = p2[props[0]] - p1[props[0]],
        y = p2[props[1]] - p1[props[1]];
    return Math.atan2(y, x) * 180 / Math.PI;
}

/**
 * calculate the rotation degrees between two pointersets
 * @param {Array} start array of pointers
 * @param {Array} end array of pointers
 * @return {Number} rotation
 */
function getRotation(start, end) {
    return getAngle(end[1], end[0], PROPS_CLIENT_XY) - getAngle(start[1], start[0], PROPS_CLIENT_XY);
}

/**
 * calculate the scale factor between two pointersets
 * no scale is 1, and goes down to 0 when pinched together, and bigger when pinched out
 * @param {Array} start array of pointers
 * @param {Array} end array of pointers
 * @return {Number} scale
 */
function getScale(start, end) {
    return getDistance(end[0], end[1], PROPS_CLIENT_XY) / getDistance(start[0], start[1], PROPS_CLIENT_XY);
}

var MOUSE_INPUT_MAP = {
    mousedown: INPUT_START,
    mousemove: INPUT_MOVE,
    mouseup: INPUT_END
};

var MOUSE_ELEMENT_EVENTS = 'mousedown';
var MOUSE_WINDOW_EVENTS = 'mousemove mouseup';

/**
 * Mouse events input
 * @constructor
 * @extends Input
 */
function MouseInput() {
    this.evEl = MOUSE_ELEMENT_EVENTS;
    this.evWin = MOUSE_WINDOW_EVENTS;

    this.allow = true; // used by Input.TouchMouse to disable mouse events
    this.pressed = false; // mousedown state

    Input.apply(this, arguments);
}

inherit(MouseInput, Input, {
    /**
     * handle mouse events
     * @param {Object} ev
     */
    handler: function MEhandler(ev) {
        var eventType = MOUSE_INPUT_MAP[ev.type];

        // on start we want to have the left mouse button down
        if (eventType & INPUT_START && ev.button === 0) {
            this.pressed = true;
        }

        if (eventType & INPUT_MOVE && ev.which !== 1) {
            eventType = INPUT_END;
        }

        // mouse must be down, and mouse events are allowed (see the TouchMouse input)
        if (!this.pressed || !this.allow) {
            return;
        }

        if (eventType & INPUT_END) {
            this.pressed = false;
        }

        this.callback(this.manager, eventType, {
            pointers: [ev],
            changedPointers: [ev],
            pointerType: INPUT_TYPE_MOUSE,
            srcEvent: ev
        });
    },
});

var POINTER_INPUT_MAP = {
    pointerdown: INPUT_START,
    pointermove: INPUT_MOVE,
    pointerup: INPUT_END,
    pointercancel: INPUT_CANCEL,
    pointerout: INPUT_CANCEL
};

// in IE10 the pointer types is defined as an enum
var IE10_POINTER_TYPE_ENUM = {
    2: INPUT_TYPE_TOUCH,
    3: INPUT_TYPE_PEN,
    4: INPUT_TYPE_MOUSE,
    5: INPUT_TYPE_KINECT // see https://twitter.com/jacobrossi/status/480596438489890816
};

var POINTER_ELEMENT_EVENTS = 'pointerdown';
var POINTER_WINDOW_EVENTS = 'pointermove pointerup pointercancel';

// IE10 has prefixed support, and case-sensitive
if (window.MSPointerEvent) {
    POINTER_ELEMENT_EVENTS = 'MSPointerDown';
    POINTER_WINDOW_EVENTS = 'MSPointerMove MSPointerUp MSPointerCancel';
}

/**
 * Pointer events input
 * @constructor
 * @extends Input
 */
function PointerEventInput() {
    this.evEl = POINTER_ELEMENT_EVENTS;
    this.evWin = POINTER_WINDOW_EVENTS;

    Input.apply(this, arguments);

    this.store = (this.manager.session.pointerEvents = []);
}

inherit(PointerEventInput, Input, {
    /**
     * handle mouse events
     * @param {Object} ev
     */
    handler: function PEhandler(ev) {
        var store = this.store;
        var removePointer = false;

        var eventTypeNormalized = ev.type.toLowerCase().replace('ms', '');
        var eventType = POINTER_INPUT_MAP[eventTypeNormalized];
        var pointerType = IE10_POINTER_TYPE_ENUM[ev.pointerType] || ev.pointerType;

        var isTouch = (pointerType == INPUT_TYPE_TOUCH);

        // start and mouse must be down
        if (eventType & INPUT_START && (ev.button === 0 || isTouch)) {
            store.push(ev);
        } else if (eventType & (INPUT_END | INPUT_CANCEL)) {
            removePointer = true;
        }

        // get index of the event in the store
        // it not found, so the pointer hasn't been down (so it's probably a hover)
        var storeIndex = inArray(store, ev.pointerId, 'pointerId');
        if (storeIndex < 0) {
            return;
        }

        // update the event in the store
        store[storeIndex] = ev;

        this.callback(this.manager, eventType, {
            pointers: store,
            changedPointers: [ev],
            pointerType: pointerType,
            srcEvent: ev
        });

        if (removePointer) {
            // remove from the store
            store.splice(storeIndex, 1);
        }
    }
});

var TOUCH_INPUT_MAP = {
    touchstart: INPUT_START,
    touchmove: INPUT_MOVE,
    touchend: INPUT_END,
    touchcancel: INPUT_CANCEL
};

var TOUCH_TARGET_EVENTS = 'touchstart touchmove touchend touchcancel';

/**
 * Touch events input
 * @constructor
 * @extends Input
 */
function TouchInput() {
    this.evTarget = TOUCH_TARGET_EVENTS;
    this.targetIds = {};

    Input.apply(this, arguments);
}

inherit(TouchInput, Input, {
    /**
     * handle touch events
     * @param {Object} ev
     */
    handler: function TEhandler(ev) {
        var type = TOUCH_INPUT_MAP[ev.type];
        var touches = getTouches.call(this, ev, type);
        if (!touches) {
            return;
        }

        this.callback(this.manager, type, {
            pointers: touches[0],
            changedPointers: touches[1],
            pointerType: INPUT_TYPE_TOUCH,
            srcEvent: ev
        });
    }
});

/**
 * @this {TouchInput}
 * @param {Object} ev
 * @param {Number} type flag
 * @returns {undefined|Array} [all, changed]
 */
function getTouches(ev, type) {
    var allTouches = toArray(ev.touches);
    var targetIds = this.targetIds;

    // when there is only one touch, the process can be simplified
    if (type & (INPUT_START | INPUT_MOVE) && allTouches.length === 1) {
        targetIds[allTouches[0].identifier] = true;
        return [allTouches, allTouches];
    }

    var i, len;
    var targetTouches = toArray(ev.targetTouches);
    var changedTouches = toArray(ev.changedTouches);
    var changedTargetTouches = [];

    // collect touches
    if (type === INPUT_START) {
        for (i = 0, len = targetTouches.length; i < len; i++) {
            targetIds[targetTouches[i].identifier] = true;
        }
    }

    // filter changed touches to only contain touches that exist in the collected target ids
    for (i = 0, len = changedTouches.length; i < len; i++) {
        if (targetIds[changedTouches[i].identifier]) {
            changedTargetTouches.push(changedTouches[i]);
        }

        // cleanup removed touches
        if (type & (INPUT_END | INPUT_CANCEL)) {
            delete targetIds[changedTouches[i].identifier];
        }
    }

    if (!changedTargetTouches.length) {
        return;
    }

    return [
        // merge targetTouches with changedTargetTouches so it contains ALL touches, including 'end' and 'cancel'
        uniqueArray(targetTouches.concat(changedTargetTouches), 'identifier', true),
        changedTargetTouches
    ];
}

/**
 * Combined touch and mouse input
 *
 * Touch has a higher priority then mouse, and while touching no mouse events are allowed.
 * This because touch devices also emit mouse events while doing a touch.
 *
 * @constructor
 * @extends Input
 */
function TouchMouseInput() {
    Input.apply(this, arguments);

    var handler = bindFn(this.handler, this);
    this.touch = new TouchInput(this.manager, handler);
    this.mouse = new MouseInput(this.manager, handler);
}

inherit(TouchMouseInput, Input, {
    /**
     * handle mouse and touch events
     * @param {Hammer} manager
     * @param {String} inputEvent
     * @param {Object} inputData
     */
    handler: function TMEhandler(manager, inputEvent, inputData) {
        var isTouch = (inputData.pointerType == INPUT_TYPE_TOUCH),
            isMouse = (inputData.pointerType == INPUT_TYPE_MOUSE);

        // when we're in a touch event, so  block all upcoming mouse events
        // most mobile browser also emit mouseevents, right after touchstart
        if (isTouch) {
            this.mouse.allow = false;
        } else if (isMouse && !this.mouse.allow) {
            return;
        }

        // reset the allowMouse when we're done
        if (inputEvent & (INPUT_END | INPUT_CANCEL)) {
            this.mouse.allow = true;
        }

        this.callback(manager, inputEvent, inputData);
    },

    /**
     * remove the event listeners
     */
    destroy: function destroy() {
        this.touch.destroy();
        this.mouse.destroy();
    }
});

var PREFIXED_TOUCH_ACTION = prefixed(TEST_ELEMENT.style, 'touchAction');
var NATIVE_TOUCH_ACTION = PREFIXED_TOUCH_ACTION !== undefined;

// magical touchAction value
var TOUCH_ACTION_COMPUTE = 'compute';
var TOUCH_ACTION_AUTO = 'auto';
var TOUCH_ACTION_MANIPULATION = 'manipulation'; // not implemented
var TOUCH_ACTION_NONE = 'none';
var TOUCH_ACTION_PAN_X = 'pan-x';
var TOUCH_ACTION_PAN_Y = 'pan-y';

/**
 * Touch Action
 * sets the touchAction property or uses the js alternative
 * @param {Manager} manager
 * @param {String} value
 * @constructor
 */
function TouchAction(manager, value) {
    this.manager = manager;
    this.set(value);
}

TouchAction.prototype = {
    /**
     * set the touchAction value on the element or enable the polyfill
     * @param {String} value
     */
    set: function(value) {
        // find out the touch-action by the event handlers
        if (value == TOUCH_ACTION_COMPUTE) {
            value = this.compute();
        }

        if (NATIVE_TOUCH_ACTION) {
            this.manager.element.style[PREFIXED_TOUCH_ACTION] = value;
        }
        this.actions = value.toLowerCase().trim();
    },

    /**
     * just re-set the touchAction value
     */
    update: function() {
        this.set(this.manager.options.touchAction);
    },

    /**
     * compute the value for the touchAction property based on the recognizer's settings
     * @returns {String} value
     */
    compute: function() {
        var actions = [];
        each(this.manager.recognizers, function(recognizer) {
            if (boolOrFn(recognizer.options.enable, [recognizer])) {
                actions = actions.concat(recognizer.getTouchAction());
            }
        });
        return cleanTouchActions(actions.join(' '));
    },

    /**
     * this method is called on each input cycle and provides the preventing of the browser behavior
     * @param {Object} input
     */
    preventDefaults: function(input) {
        // not needed with native support for the touchAction property
        if (NATIVE_TOUCH_ACTION) {
            return;
        }

        var srcEvent = input.srcEvent;
        var direction = input.offsetDirection;

        // if the touch action did prevented once this session
        if (this.manager.session.prevented) {
            srcEvent.preventDefault();
            return;
        }

        var actions = this.actions;
        var hasNone = inStr(actions, TOUCH_ACTION_NONE);
        var hasPanY = inStr(actions, TOUCH_ACTION_PAN_Y);
        var hasPanX = inStr(actions, TOUCH_ACTION_PAN_X);

        if (hasNone || (hasPanY && hasPanX) ||
            (hasPanY && direction & DIRECTION_HORIZONTAL) ||
            (hasPanX && direction & DIRECTION_VERTICAL)) {
            return this.preventSrc(srcEvent);
        }
    },

    /**
     * call preventDefault to prevent the browser's default behavior (scrolling in most cases)
     * @param {Object} srcEvent
     */
    preventSrc: function(srcEvent) {
        this.manager.session.prevented = true;
        srcEvent.preventDefault();
    }
};

/**
 * when the touchActions are collected they are not a valid value, so we need to clean things up. *
 * @param {String} actions
 * @returns {*}
 */
function cleanTouchActions(actions) {
    // none
    if (inStr(actions, TOUCH_ACTION_NONE)) {
        return TOUCH_ACTION_NONE;
    }

    var hasPanX = inStr(actions, TOUCH_ACTION_PAN_X);
    var hasPanY = inStr(actions, TOUCH_ACTION_PAN_Y);

    // pan-x and pan-y can be combined
    if (hasPanX && hasPanY) {
        return TOUCH_ACTION_PAN_X + ' ' + TOUCH_ACTION_PAN_Y;
    }

    // pan-x OR pan-y
    if (hasPanX || hasPanY) {
        return hasPanX ? TOUCH_ACTION_PAN_X : TOUCH_ACTION_PAN_Y;
    }

    // manipulation
    if (inStr(actions, TOUCH_ACTION_MANIPULATION)) {
        return TOUCH_ACTION_MANIPULATION;
    }

    return TOUCH_ACTION_AUTO;
}

/**
 * Recognizer flow explained; *
 * All recognizers have the initial state of POSSIBLE when a input session starts.
 * The definition of a input session is from the first input until the last input, with all it's movement in it. *
 * Example session for mouse-input: mousedown -> mousemove -> mouseup
 *
 * On each recognizing cycle (see Manager.recognize) the .recognize() method is executed
 * which determines with state it should be.
 *
 * If the recognizer has the state FAILED, CANCELLED or RECOGNIZED (equals ENDED), it is reset to
 * POSSIBLE to give it another change on the next cycle.
 *
 *               Possible
 *                  |
 *            +-----+---------------+
 *            |                     |
 *      +-----+-----+               |
 *      |           |               |
 *   Failed      Cancelled          |
 *                          +-------+------+
 *                          |              |
 *                      Recognized       Began
 *                                         |
 *                                      Changed
 *                                         |
 *                                  Ended/Recognized
 */
var STATE_POSSIBLE = 1;
var STATE_BEGAN = 2;
var STATE_CHANGED = 4;
var STATE_ENDED = 8;
var STATE_RECOGNIZED = STATE_ENDED;
var STATE_CANCELLED = 16;
var STATE_FAILED = 32;

/**
 * Recognizer
 * Every recognizer needs to extend from this class.
 * @constructor
 * @param {Object} options
 */
function Recognizer(options) {
    this.id = uniqueId();

    this.manager = null;
    this.options = merge(options || {}, this.defaults);

    // default is enable true
    this.options.enable = ifUndefined(this.options.enable, true);

    this.state = STATE_POSSIBLE;

    this.simultaneous = {};
    this.requireFail = [];
}

Recognizer.prototype = {
    /**
     * @virtual
     * @type {Object}
     */
    defaults: {},

    /**
     * set options
     * @param {Object} options
     * @return {Recognizer}
     */
    set: function(options) {
        extend(this.options, options);

        // also update the touchAction, in case something changed about the directions/enabled state
        this.manager && this.manager.touchAction.update();
        return this;
    },

    /**
     * recognize simultaneous with an other recognizer.
     * @param {Recognizer} otherRecognizer
     * @returns {Recognizer} this
     */
    recognizeWith: function(otherRecognizer) {
        if (invokeArrayArg(otherRecognizer, 'recognizeWith', this)) {
            return this;
        }

        var simultaneous = this.simultaneous;
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this);
        if (!simultaneous[otherRecognizer.id]) {
            simultaneous[otherRecognizer.id] = otherRecognizer;
            otherRecognizer.recognizeWith(this);
        }
        return this;
    },

    /**
     * drop the simultaneous link. it doesnt remove the link on the other recognizer.
     * @param {Recognizer} otherRecognizer
     * @returns {Recognizer} this
     */
    dropRecognizeWith: function(otherRecognizer) {
        if (invokeArrayArg(otherRecognizer, 'dropRecognizeWith', this)) {
            return this;
        }

        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this);
        delete this.simultaneous[otherRecognizer.id];
        return this;
    },

    /**
     * recognizer can only run when an other is failing
     * @param {Recognizer} otherRecognizer
     * @returns {Recognizer} this
     */
    requireFailure: function(otherRecognizer) {
        if (invokeArrayArg(otherRecognizer, 'requireFailure', this)) {
            return this;
        }

        var requireFail = this.requireFail;
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this);
        if (inArray(requireFail, otherRecognizer) === -1) {
            requireFail.push(otherRecognizer);
            otherRecognizer.requireFailure(this);
        }
        return this;
    },

    /**
     * drop the requireFailure link. it does not remove the link on the other recognizer.
     * @param {Recognizer} otherRecognizer
     * @returns {Recognizer} this
     */
    dropRequireFailure: function(otherRecognizer) {
        if (invokeArrayArg(otherRecognizer, 'dropRequireFailure', this)) {
            return this;
        }

        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this);
        var index = inArray(this.requireFail, otherRecognizer);
        if (index > -1) {
            this.requireFail.splice(index, 1);
        }
        return this;
    },

    /**
     * has require failures boolean
     * @returns {boolean}
     */
    hasRequireFailures: function() {
        return this.requireFail.length > 0;
    },

    /**
     * if the recognizer can recognize simultaneous with an other recognizer
     * @param {Recognizer} otherRecognizer
     * @returns {Boolean}
     */
    canRecognizeWith: function(otherRecognizer) {
        return !!this.simultaneous[otherRecognizer.id];
    },

    /**
     * You should use `tryEmit` instead of `emit` directly to check
     * that all the needed recognizers has failed before emitting.
     * @param {Object} input
     */
    emit: function(input) {
        var self = this;
        var state = this.state;

        function emit(withState) {
            self.manager.emit(self.options.event + (withState ? stateStr(state) : ''), input);
        }

        // 'panstart' and 'panmove'
        if (state < STATE_ENDED) {
            emit(true);
        }

        emit(); // simple 'eventName' events

        // panend and pancancel
        if (state >= STATE_ENDED) {
            emit(true);
        }
    },

    /**
     * Check that all the require failure recognizers has failed,
     * if true, it emits a gesture event,
     * otherwise, setup the state to FAILED.
     * @param {Object} input
     */
    tryEmit: function(input) {
        if (this.canEmit()) {
            return this.emit(input);
        }
        // it's failing anyway
        this.state = STATE_FAILED;
    },

    /**
     * can we emit?
     * @returns {boolean}
     */
    canEmit: function() {
        for (var i = 0; i < this.requireFail.length; i++) {
            if (!(this.requireFail[i].state & (STATE_FAILED | STATE_POSSIBLE))) {
                return false;
            }
        }
        return true;
    },

    /**
     * update the recognizer
     * @param {Object} inputData
     */
    recognize: function(inputData) {
        // make a new copy of the inputData
        // so we can change the inputData without messing up the other recognizers
        var inputDataClone = extend({}, inputData);

        // is is enabled and allow recognizing?
        if (!boolOrFn(this.options.enable, [this, inputDataClone])) {
            this.reset();
            this.state = STATE_FAILED;
            return;
        }

        // reset when we've reached the end
        if (this.state & (STATE_RECOGNIZED | STATE_CANCELLED | STATE_FAILED)) {
            this.state = STATE_POSSIBLE;
        }

        this.state = this.process(inputDataClone);

        // the recognizer has recognized a gesture
        // so trigger an event
        if (this.state & (STATE_BEGAN | STATE_CHANGED | STATE_ENDED | STATE_CANCELLED)) {
            this.tryEmit(inputDataClone);
        }
    },

    /**
     * return the state of the recognizer
     * the actual recognizing happens in this method
     * @virtual
     * @param {Object} inputData
     * @returns {Const} STATE
     */
    process: function(inputData) { }, // jshint ignore:line

    /**
     * return the preferred touch-action
     * @virtual
     * @returns {Array}
     */
    getTouchAction: function() { },

    /**
     * called when the gesture isn't allowed to recognize
     * like when another is being recognized or it is disabled
     * @virtual
     */
    reset: function() { }
};

/**
 * get a usable string, used as event postfix
 * @param {Const} state
 * @returns {String} state
 */
function stateStr(state) {
    if (state & STATE_CANCELLED) {
        return 'cancel';
    } else if (state & STATE_ENDED) {
        return 'end';
    } else if (state & STATE_CHANGED) {
        return 'move';
    } else if (state & STATE_BEGAN) {
        return 'start';
    }
    return '';
}

/**
 * direction cons to string
 * @param {Const} direction
 * @returns {String}
 */
function directionStr(direction) {
    if (direction == DIRECTION_DOWN) {
        return 'down';
    } else if (direction == DIRECTION_UP) {
        return 'up';
    } else if (direction == DIRECTION_LEFT) {
        return 'left';
    } else if (direction == DIRECTION_RIGHT) {
        return 'right';
    }
    return '';
}

/**
 * get a recognizer by name if it is bound to a manager
 * @param {Recognizer|String} otherRecognizer
 * @param {Recognizer} recognizer
 * @returns {Recognizer}
 */
function getRecognizerByNameIfManager(otherRecognizer, recognizer) {
    var manager = recognizer.manager;
    if (manager) {
        return manager.get(otherRecognizer);
    }
    return otherRecognizer;
}

/**
 * This recognizer is just used as a base for the simple attribute recognizers.
 * @constructor
 * @extends Recognizer
 */
function AttrRecognizer() {
    Recognizer.apply(this, arguments);
}

inherit(AttrRecognizer, Recognizer, {
    /**
     * @namespace
     * @memberof AttrRecognizer
     */
    defaults: {
        /**
         * @type {Number}
         * @default 1
         */
        pointers: 1
    },

    /**
     * Used to check if it the recognizer receives valid input, like input.distance > 10.
     * @memberof AttrRecognizer
     * @param {Object} input
     * @returns {Boolean} recognized
     */
    attrTest: function(input) {
        var optionPointers = this.options.pointers;
        return optionPointers === 0 || input.pointers.length === optionPointers;
    },

    /**
     * Process the input and return the state for the recognizer
     * @memberof AttrRecognizer
     * @param {Object} input
     * @returns {*} State
     */
    process: function(input) {
        var state = this.state;
        var eventType = input.eventType;

        var isRecognized = state & (STATE_BEGAN | STATE_CHANGED);
        var isValid = this.attrTest(input);

        // on cancel input and we've recognized before, return STATE_CANCELLED
        if (isRecognized && (eventType & INPUT_CANCEL || !isValid)) {
            return state | STATE_CANCELLED;
        } else if (isRecognized || isValid) {
            if (eventType & INPUT_END) {
                return state | STATE_ENDED;
            } else if (!(state & STATE_BEGAN)) {
                return STATE_BEGAN;
            }
            return state | STATE_CHANGED;
        }
        return STATE_FAILED;
    }
});

/**
 * Pan
 * Recognized when the pointer is down and moved in the allowed direction.
 * @constructor
 * @extends AttrRecognizer
 */
function PanRecognizer() {
    AttrRecognizer.apply(this, arguments);

    this.pX = null;
    this.pY = null;
}

inherit(PanRecognizer, AttrRecognizer, {
    /**
     * @namespace
     * @memberof PanRecognizer
     */
    defaults: {
        event: 'pan',
        threshold: 10,
        pointers: 1,
        direction: DIRECTION_ALL
    },

    getTouchAction: function() {
        var direction = this.options.direction;

        if (direction === DIRECTION_ALL) {
            return [TOUCH_ACTION_NONE];
        }

        var actions = [];
        if (direction & DIRECTION_HORIZONTAL) {
            actions.push(TOUCH_ACTION_PAN_Y);
        }
        if (direction & DIRECTION_VERTICAL) {
            actions.push(TOUCH_ACTION_PAN_X);
        }
        return actions;
    },

    directionTest: function(input) {
        var options = this.options;
        var hasMoved = true;
        var distance = input.distance;
        var direction = input.direction;
        var x = input.deltaX;
        var y = input.deltaY;

        // lock to axis?
        if (!(direction & options.direction)) {
            if (options.direction & DIRECTION_HORIZONTAL) {
                direction = (x === 0) ? DIRECTION_NONE : (x < 0) ? DIRECTION_LEFT : DIRECTION_RIGHT;
                hasMoved = x != this.pX;
                distance = Math.abs(input.deltaX);
            } else {
                direction = (y === 0) ? DIRECTION_NONE : (y < 0) ? DIRECTION_UP : DIRECTION_DOWN;
                hasMoved = y != this.pY;
                distance = Math.abs(input.deltaY);
            }
        }
        input.direction = direction;
        return hasMoved && distance > options.threshold && direction & options.direction;
    },

    attrTest: function(input) {
        return AttrRecognizer.prototype.attrTest.call(this, input) &&
            (this.state & STATE_BEGAN || (!(this.state & STATE_BEGAN) && this.directionTest(input)));
    },

    emit: function(input) {
        this.pX = input.deltaX;
        this.pY = input.deltaY;

        var direction = directionStr(input.direction);
        if (direction) {
            this.manager.emit(this.options.event + direction, input);
        }

        this._super.emit.call(this, input);
    }
});

/**
 * Pinch
 * Recognized when two or more pointers are moving toward (zoom-in) or away from each other (zoom-out).
 * @constructor
 * @extends AttrRecognizer
 */
function PinchRecognizer() {
    AttrRecognizer.apply(this, arguments);
}

inherit(PinchRecognizer, AttrRecognizer, {
    /**
     * @namespace
     * @memberof PinchRecognizer
     */
    defaults: {
        event: 'pinch',
        threshold: 0,
        pointers: 2
    },

    getTouchAction: function() {
        return [TOUCH_ACTION_NONE];
    },

    attrTest: function(input) {
        return this._super.attrTest.call(this, input) &&
            (Math.abs(input.scale - 1) > this.options.threshold || this.state & STATE_BEGAN);
    },

    emit: function(input) {
        this._super.emit.call(this, input);
        if (input.scale !== 1) {
            var inOut = input.scale < 1 ? 'in' : 'out';
            this.manager.emit(this.options.event + inOut, input);
        }
    }
});

/**
 * Press
 * Recognized when the pointer is down for x ms without any movement.
 * @constructor
 * @extends Recognizer
 */
function PressRecognizer() {
    Recognizer.apply(this, arguments);

    this._timer = null;
    this._input = null;
}

inherit(PressRecognizer, Recognizer, {
    /**
     * @namespace
     * @memberof PressRecognizer
     */
    defaults: {
        event: 'press',
        pointers: 1,
        time: 500, // minimal time of the pointer to be pressed
        threshold: 5 // a minimal movement is ok, but keep it low
    },

    getTouchAction: function() {
        return [TOUCH_ACTION_AUTO];
    },

    process: function(input) {
        var options = this.options;
        var validPointers = input.pointers.length === options.pointers;
        var validMovement = input.distance < options.threshold;
        var validTime = input.deltaTime > options.time;

        this._input = input;

        // we only allow little movement
        // and we've reached an end event, so a tap is possible
        if (!validMovement || !validPointers || (input.eventType & (INPUT_END | INPUT_CANCEL) && !validTime)) {
            this.reset();
        } else if (input.eventType & INPUT_START) {
            this.reset();
            this._timer = setTimeoutContext(function() {
                this.state = STATE_RECOGNIZED;
                this.tryEmit();
            }, options.time, this);
        } else if (input.eventType & INPUT_END) {
            return STATE_RECOGNIZED;
        }
        return STATE_FAILED;
    },

    reset: function() {
        clearTimeout(this._timer);
    },

    emit: function(input) {
        if (this.state !== STATE_RECOGNIZED) {
            return;
        }

        if (input && (input.eventType & INPUT_END)) {
            this.manager.emit(this.options.event + 'up', input);
        } else {
            this._input.timeStamp = now();
            this.manager.emit(this.options.event, this._input);
        }
    }
});

/**
 * Rotate
 * Recognized when two or more pointer are moving in a circular motion.
 * @constructor
 * @extends AttrRecognizer
 */
function RotateRecognizer() {
    AttrRecognizer.apply(this, arguments);
}

inherit(RotateRecognizer, AttrRecognizer, {
    /**
     * @namespace
     * @memberof RotateRecognizer
     */
    defaults: {
        event: 'rotate',
        threshold: 0,
        pointers: 2
    },

    getTouchAction: function() {
        return [TOUCH_ACTION_NONE];
    },

    attrTest: function(input) {
        return this._super.attrTest.call(this, input) &&
            (Math.abs(input.rotation) > this.options.threshold || this.state & STATE_BEGAN);
    }
});

/**
 * Swipe
 * Recognized when the pointer is moving fast (velocity), with enough distance in the allowed direction.
 * @constructor
 * @extends AttrRecognizer
 */
function SwipeRecognizer() {
    AttrRecognizer.apply(this, arguments);
}

inherit(SwipeRecognizer, AttrRecognizer, {
    /**
     * @namespace
     * @memberof SwipeRecognizer
     */
    defaults: {
        event: 'swipe',
        threshold: 10,
        velocity: 0.65,
        direction: DIRECTION_HORIZONTAL | DIRECTION_VERTICAL,
        pointers: 1
    },

    getTouchAction: function() {
        return PanRecognizer.prototype.getTouchAction.call(this);
    },

    attrTest: function(input) {
        var direction = this.options.direction;
        var velocity;

        if (direction & (DIRECTION_HORIZONTAL | DIRECTION_VERTICAL)) {
            velocity = input.velocity;
        } else if (direction & DIRECTION_HORIZONTAL) {
            velocity = input.velocityX;
        } else if (direction & DIRECTION_VERTICAL) {
            velocity = input.velocityY;
        }

        return this._super.attrTest.call(this, input) &&
            direction & input.direction &&
            abs(velocity) > this.options.velocity && input.eventType & INPUT_END;
    },

    emit: function(input) {
        var direction = directionStr(input.direction);
        if (direction) {
            this.manager.emit(this.options.event + direction, input);
        }

        this.manager.emit(this.options.event, input);
    }
});

/**
 * A tap is ecognized when the pointer is doing a small tap/click. Multiple taps are recognized if they occur
 * between the given interval and position. The delay option can be used to recognize multi-taps without firing
 * a single tap.
 *
 * The eventData from the emitted event contains the property `tapCount`, which contains the amount of
 * multi-taps being recognized.
 * @constructor
 * @extends Recognizer
 */
function TapRecognizer() {
    Recognizer.apply(this, arguments);

    // previous time and center,
    // used for tap counting
    this.pTime = false;
    this.pCenter = false;

    this._timer = null;
    this._input = null;
    this.count = 0;
}

inherit(TapRecognizer, Recognizer, {
    /**
     * @namespace
     * @memberof PinchRecognizer
     */
    defaults: {
        event: 'tap',
        pointers: 1,
        taps: 1,
        interval: 300, // max time between the multi-tap taps
        time: 250, // max time of the pointer to be down (like finger on the screen)
        threshold: 2, // a minimal movement is ok, but keep it low
        posThreshold: 10 // a multi-tap can be a bit off the initial position
    },

    getTouchAction: function() {
        return [TOUCH_ACTION_MANIPULATION];
    },

    process: function(input) {
        var options = this.options;

        var validPointers = input.pointers.length === options.pointers;
        var validMovement = input.distance < options.threshold;
        var validTouchTime = input.deltaTime < options.time;

        this.reset();

        if ((input.eventType & INPUT_START) && (this.count === 0)) {
            return this.failTimeout();
        }

        // we only allow little movement
        // and we've reached an end event, so a tap is possible
        if (validMovement && validTouchTime && validPointers) {
            if (input.eventType != INPUT_END) {
                return this.failTimeout();
            }

            var validInterval = this.pTime ? (input.timeStamp - this.pTime < options.interval) : true;
            var validMultiTap = !this.pCenter || getDistance(this.pCenter, input.center) < options.posThreshold;

            this.pTime = input.timeStamp;
            this.pCenter = input.center;

            if (!validMultiTap || !validInterval) {
                this.count = 1;
            } else {
                this.count += 1;
            }

            this._input = input;

            // if tap count matches we have recognized it,
            // else it has began recognizing...
            var tapCount = this.count % options.taps;
            if (tapCount === 0) {
                // no failing requirements, immediately trigger the tap event
                // or wait as long as the multitap interval to trigger
                if (!this.hasRequireFailures()) {
                    return STATE_RECOGNIZED;
                } else {
                    this._timer = setTimeoutContext(function() {
                        this.state = STATE_RECOGNIZED;
                        this.tryEmit();
                    }, options.interval, this);
                    return STATE_BEGAN;
                }
            }
        }
        return STATE_FAILED;
    },

    failTimeout: function() {
        this._timer = setTimeoutContext(function() {
            this.state = STATE_FAILED;
        }, this.options.interval, this);
        return STATE_FAILED;
    },

    reset: function() {
        clearTimeout(this._timer);
    },

    emit: function() {
        if (this.state == STATE_RECOGNIZED ) {
            this._input.tapCount = this.count;
            this.manager.emit(this.options.event, this._input);
        }
    }
});

/**
 * Simple way to create an manager with a default set of recognizers.
 * @param {HTMLElement} element
 * @param {Object} [options]
 * @constructor
 */
function Hammer(element, options) {
    options = options || {};
    options.recognizers = ifUndefined(options.recognizers, Hammer.defaults.preset);
    return new Manager(element, options);
}

/**
 * @const {string}
 */
Hammer.VERSION = '2.0.2';

/**
 * default settings
 * @namespace
 */
Hammer.defaults = {
    /**
     * set if DOM events are being triggered.
     * But this is slower and unused by simple implementations, so disabled by default.
     * @type {Boolean}
     * @default false
     */
    domEvents: false,

    /**
     * The value for the touchAction property/fallback.
     * When set to `compute` it will magically set the correct value based on the added recognizers.
     * @type {String}
     * @default compute
     */
    touchAction: TOUCH_ACTION_COMPUTE,

    /**
     * EXPERIMENTAL FEATURE
     * Change the parent input target element.
     * If Null, then it is being set the to main element.
     * @type {Null|EventTarget}
     * @default null
     */
    inputTarget: null,

    /**
     * @type {Boolean}
     * @default true
     */
    enable: true,

    /**
     * Default recognizer setup when calling `Hammer()`
     * When creating a new Manager these will be skipped.
     * @type {Array}
     */
    preset: [
        // RecognizerClass, options, [recognizeWith, ...], [requireFailure, ...]
        [RotateRecognizer, { enable: false }],
        [PinchRecognizer, { enable: false }, ['rotate']],
        [SwipeRecognizer,{ direction: DIRECTION_HORIZONTAL }],
        [PanRecognizer, { direction: DIRECTION_HORIZONTAL }, ['swipe']],
        [TapRecognizer],
        [TapRecognizer, { event: 'doubletap', taps: 2 }, ['tap']],
        [PressRecognizer]
    ],

    /**
     * Some CSS properties can be used to improve the working of Hammer.
     * Add them to this method and they will be set when creating a new Manager.
     * @namespace
     */
    cssProps: {
        /**
         * Disables text selection to improve the dragging gesture. Mainly for desktop browsers.
         * @type {String}
         * @default 'none'
         */
        userSelect: 'none',

        /**
         * Disable the Windows Phone grippers when pressing an element.
         * @type {String}
         * @default 'none'
         */
        touchSelect: 'none',

        /**
         * Disables the default callout shown when you touch and hold a touch target.
         * On iOS, when you touch and hold a touch target such as a link, Safari displays
         * a callout containing information about the link. This property allows you to disable that callout.
         * @type {String}
         * @default 'none'
         */
        touchCallout: 'none',

        /**
         * Specifies whether zooming is enabled. Used by IE10>
         * @type {String}
         * @default 'none'
         */
        contentZooming: 'none',

        /**
         * Specifies that an entire element should be draggable instead of its contents. Mainly for desktop browsers.
         * @type {String}
         * @default 'none'
         */
        userDrag: 'none',

        /**
         * Overrides the highlight color shown when the user taps a link or a JavaScript
         * clickable element in iOS. This property obeys the alpha value, if specified.
         * @type {String}
         * @default 'rgba(0,0,0,0)'
         */
        tapHighlightColor: 'rgba(0,0,0,0)'
    }
};

var STOP = 1;
var FORCED_STOP = 2;

/**
 * Manager
 * @param {HTMLElement} element
 * @param {Object} [options]
 * @constructor
 */
function Manager(element, options) {
    options = options || {};

    this.options = merge(options, Hammer.defaults);
    this.options.inputTarget = this.options.inputTarget || element;

    this.handlers = {};
    this.session = {};
    this.recognizers = [];

    this.element = element;
    this.input = createInputInstance(this);
    this.touchAction = new TouchAction(this, this.options.touchAction);

    toggleCssProps(this, true);

    each(options.recognizers, function(item) {
        var recognizer = this.add(new (item[0])(item[1]));
        item[2] && recognizer.recognizeWith(item[2]);
        item[3] && recognizer.requireFailure(item[2]);
    }, this);
}

Manager.prototype = {
    /**
     * set options
     * @param {Object} options
     * @returns {Manager}
     */
    set: function(options) {
        extend(this.options, options);
        return this;
    },

    /**
     * stop recognizing for this session.
     * This session will be discarded, when a new [input]start event is fired.
     * When forced, the recognizer cycle is stopped immediately.
     * @param {Boolean} [force]
     */
    stop: function(force) {
        this.session.stopped = force ? FORCED_STOP : STOP;
    },

    /**
     * run the recognizers!
     * called by the inputHandler function on every movement of the pointers (touches)
     * it walks through all the recognizers and tries to detect the gesture that is being made
     * @param {Object} inputData
     */
    recognize: function(inputData) {
        var session = this.session;
        if (session.stopped) {
            return;
        }

        // run the touch-action polyfill
        this.touchAction.preventDefaults(inputData);

        var recognizer;
        var recognizers = this.recognizers;

        // this holds the recognizer that is being recognized.
        // so the recognizer's state needs to be BEGAN, CHANGED, ENDED or RECOGNIZED
        // if no recognizer is detecting a thing, it is set to `null`
        var curRecognizer = session.curRecognizer;

        // reset when the last recognizer is recognized
        // or when we're in a new session
        if (!curRecognizer || (curRecognizer && curRecognizer.state & STATE_RECOGNIZED)) {
            curRecognizer = session.curRecognizer = null;
        }

        for (var i = 0, len = recognizers.length; i < len; i++) {
            recognizer = recognizers[i];

            // find out if we are allowed try to recognize the input for this one.
            // 1.   allow if the session is NOT forced stopped (see the .stop() method)
            // 2.   allow if we still haven't recognized a gesture in this session, or the this recognizer is the one
            //      that is being recognized.
            // 3.   allow if the recognizer is allowed to run simultaneous with the current recognized recognizer.
            //      this can be setup with the `recognizeWith()` method on the recognizer.
            if (session.stopped !== FORCED_STOP && ( // 1
                    !curRecognizer || recognizer == curRecognizer || // 2
                    recognizer.canRecognizeWith(curRecognizer))) { // 3
                recognizer.recognize(inputData);
            } else {
                recognizer.reset();
            }

            // if the recognizer has been recognizing the input as a valid gesture, we want to store this one as the
            // current active recognizer. but only if we don't already have an active recognizer
            if (!curRecognizer && recognizer.state & (STATE_BEGAN | STATE_CHANGED | STATE_ENDED)) {
                curRecognizer = session.curRecognizer = recognizer;
            }
        }
    },

    /**
     * get a recognizer by its event name.
     * @param {Recognizer|String} recognizer
     * @returns {Recognizer|Null}
     */
    get: function(recognizer) {
        if (recognizer instanceof Recognizer) {
            return recognizer;
        }

        var recognizers = this.recognizers;
        for (var i = 0; i < recognizers.length; i++) {
            if (recognizers[i].options.event == recognizer) {
                return recognizers[i];
            }
        }
        return null;
    },

    /**
     * add a recognizer to the manager
     * existing recognizers with the same event name will be removed
     * @param {Recognizer} recognizer
     * @returns {Recognizer|Manager}
     */
    add: function(recognizer) {
        if (invokeArrayArg(recognizer, 'add', this)) {
            return this;
        }

        // remove existing
        var existing = this.get(recognizer.options.event);
        if (existing) {
            this.remove(existing);
        }

        this.recognizers.push(recognizer);
        recognizer.manager = this;

        this.touchAction.update();
        return recognizer;
    },

    /**
     * remove a recognizer by name or instance
     * @param {Recognizer|String} recognizer
     * @returns {Manager}
     */
    remove: function(recognizer) {
        if (invokeArrayArg(recognizer, 'remove', this)) {
            return this;
        }

        var recognizers = this.recognizers;
        recognizer = this.get(recognizer);
        recognizers.splice(inArray(recognizers, recognizer), 1);

        this.touchAction.update();
        return this;
    },

    /**
     * bind event
     * @param {String} events
     * @param {Function} handler
     * @returns {EventEmitter} this
     */
    on: function(events, handler) {
        var handlers = this.handlers;
        each(splitStr(events), function(event) {
            handlers[event] = handlers[event] || [];
            handlers[event].push(handler);
        });
        return this;
    },

    /**
     * unbind event, leave emit blank to remove all handlers
     * @param {String} events
     * @param {Function} [handler]
     * @returns {EventEmitter} this
     */
    off: function(events, handler) {
        var handlers = this.handlers;
        each(splitStr(events), function(event) {
            if (!handler) {
                delete handlers[event];
            } else {
                handlers[event].splice(inArray(handlers[event], handler), 1);
            }
        });
        return this;
    },

    /**
     * emit event to the listeners
     * @param {String} event
     * @param {Object} data
     */
    emit: function(event, data) {
        // we also want to trigger dom events
        if (this.options.domEvents) {
            triggerDomEvent(event, data);
        }

        // no handlers, so skip it all
        var handlers = this.handlers[event] && this.handlers[event].slice();
        if (!handlers || !handlers.length) {
            return;
        }

        data.type = event;
        data.preventDefault = function() {
            data.srcEvent.preventDefault();
        };

        for (var i = 0, len = handlers.length; i < len; i++) {
            handlers[i](data);
        }
    },

    /**
     * destroy the manager and unbinds all events
     * it doesn't unbind dom events, that is the user own responsibility
     */
    destroy: function() {
        this.element && toggleCssProps(this, false);

        this.handlers = {};
        this.session = {};
        this.input.destroy();
        this.element = null;
    }
};

/**
 * add/remove the css properties as defined in manager.options.cssProps
 * @param {Manager} manager
 * @param {Boolean} add
 */
function toggleCssProps(manager, add) {
    var element = manager.element;
    each(manager.options.cssProps, function(value, name) {
        element.style[prefixed(element.style, name)] = add ? value : '';
    });
}

/**
 * trigger dom event
 * @param {String} event
 * @param {Object} data
 */
function triggerDomEvent(event, data) {
    var gestureEvent = document.createEvent('Event');
    gestureEvent.initEvent(event, true, true);
    gestureEvent.gesture = data;
    data.target.dispatchEvent(gestureEvent);
}

extend(Hammer, {
    INPUT_START: INPUT_START,
    INPUT_MOVE: INPUT_MOVE,
    INPUT_END: INPUT_END,
    INPUT_CANCEL: INPUT_CANCEL,

    STATE_POSSIBLE: STATE_POSSIBLE,
    STATE_BEGAN: STATE_BEGAN,
    STATE_CHANGED: STATE_CHANGED,
    STATE_ENDED: STATE_ENDED,
    STATE_RECOGNIZED: STATE_RECOGNIZED,
    STATE_CANCELLED: STATE_CANCELLED,
    STATE_FAILED: STATE_FAILED,

    DIRECTION_NONE: DIRECTION_NONE,
    DIRECTION_LEFT: DIRECTION_LEFT,
    DIRECTION_RIGHT: DIRECTION_RIGHT,
    DIRECTION_UP: DIRECTION_UP,
    DIRECTION_DOWN: DIRECTION_DOWN,
    DIRECTION_HORIZONTAL: DIRECTION_HORIZONTAL,
    DIRECTION_VERTICAL: DIRECTION_VERTICAL,
    DIRECTION_ALL: DIRECTION_ALL,

    Manager: Manager,
    Input: Input,
    TouchAction: TouchAction,

    Recognizer: Recognizer,
    AttrRecognizer: AttrRecognizer,
    Tap: TapRecognizer,
    Pan: PanRecognizer,
    Swipe: SwipeRecognizer,
    Pinch: PinchRecognizer,
    Rotate: RotateRecognizer,
    Press: PressRecognizer,

    on: addEventListeners,
    off: removeEventListeners,
    each: each,
    merge: merge,
    extend: extend,
    inherit: inherit,
    bindFn: bindFn,
    prefixed: prefixed
});

if (typeof define == TYPE_FUNCTION && define.amd) {
    define(function() {
        return Hammer;
    });
} else if (typeof module != 'undefined' && module.exports) {
    module.exports = Hammer;
} else {
    window[exportName] = Hammer;
}

})(window, document, 'Hammer');

},{}],7:[function(require,module,exports){
module.exports = function(subject) {
  validateSubject(subject);

  var eventsStorage = createEventsStorage(subject);
  subject.on = eventsStorage.on;
  subject.off = eventsStorage.off;
  subject.fire = eventsStorage.fire;
  return subject;
};

function createEventsStorage(subject) {
  // Store all event listeners to this hash. Key is event name, value is array
  // of callback records.
  //
  // A callback record consists of callback function and its optional context:
  // { 'eventName' => [{callback: function, ctx: object}] }
  var registeredEvents = Object.create(null);

  return {
    on: function (eventName, callback, ctx) {
      if (typeof callback !== 'function') {
        throw new Error('callback is expected to be a function');
      }
      var handlers = registeredEvents[eventName];
      if (!handlers) {
        handlers = registeredEvents[eventName] = [];
      }
      handlers.push({callback: callback, ctx: ctx});

      return subject;
    },

    off: function (eventName, callback) {
      var wantToRemoveAll = (typeof eventName === 'undefined');
      if (wantToRemoveAll) {
        // Killing old events storage should be enough in this case:
        registeredEvents = Object.create(null);
        return subject;
      }

      if (registeredEvents[eventName]) {
        var deleteAllCallbacksForEvent = (typeof callback !== 'function');
        if (deleteAllCallbacksForEvent) {
          delete registeredEvents[eventName];
        } else {
          var callbacks = registeredEvents[eventName];
          for (var i = 0; i < callbacks.length; ++i) {
            if (callbacks[i].callback === callback) {
              callbacks.splice(i, 1);
            }
          }
        }
      }

      return subject;
    },

    fire: function (eventName) {
      var callbacks = registeredEvents[eventName];
      if (!callbacks) {
        return subject;
      }

      var fireArguments;
      if (arguments.length > 1) {
        fireArguments = Array.prototype.splice.call(arguments, 1);
      }
      for(var i = 0; i < callbacks.length; ++i) {
        var callbackInfo = callbacks[i];
        callbackInfo.callback.apply(callbackInfo.ctx, fireArguments);
      }

      return subject;
    }
  };
}

function validateSubject(subject) {
  if (!subject) {
    throw new Error('Eventify cannot use falsy object as events subject');
  }
  var reservedWords = ['on', 'fire', 'off'];
  for (var i = 0; i < reservedWords.length; ++i) {
    if (subject.hasOwnProperty(reservedWords[i])) {
      throw new Error("Subject cannot be eventified, since it already has property '" + reservedWords[i] + "'");
    }
  }
}

},{}],8:[function(require,module,exports){
module.exports = createLayout;

// Maximum movement of the system at which system should be considered as stable
var MAX_MOVEMENT = 0.001; 

/**
 * Creates force based layout for a given graph.
 * @param {ngraph.graph} graph which needs to be layed out
 * @param {ngraph.physics.simulator=} physicsSimulator if you need custom settings
 * for physics simulator you can pass your own simulator here. If it's not passed
 * a default one will be created
 */
function createLayout(graph, physicsSimulator) {
  if (!graph) {
    throw new Error('Graph structure cannot be undefined');
  }

  var simulator = require('ngraph.physics.simulator'),
      physics = require('ngraph.physics.primitives');

  physicsSimulator = physicsSimulator || simulator();

  var nodeBodies = typeof Object.create === 'function' ? Object.create(null) : {},
      springs = {};

  // Initialize physical objects according to what we have in the graph:
  initPhysics();
  listenToGraphEvents();

  return {
    /**
     * Performs one step of iterative layout algorithm
     */
    step: function() {
      var totalMovement = physicsSimulator.step();
      return totalMovement < MAX_MOVEMENT;
    },

    /**
     * For a given `nodeId` returns position
     */
    getNodePosition: function (nodeId) {
      return getInitializedBody(nodeId).pos;
    },

    /**
     * Sets position of a node to a given coordinates
     */
    setNodePosition: function (nodeId, x, y) {
      var body = getInitializedBody(nodeId);
      body.prevPos.x = body.pos.x = x;
      body.prevPos.y = body.pos.y = y;
    },

    /**
     * @returns {Object} Link position by link id
     * @returns {Object.from} {x, y} coordinates of link start
     * @returns {Object.to} {x, y} coordinates of link end
     */
    getLinkPosition: function (linkId) {
      var spring = springs[linkId];
      if (spring) {
        return {
          from: spring.from.pos,
          to: spring.to.pos
        };
      }
    },

    /**
     * @returns {Object} area required to fit in the graph. Object contains
     * `x1`, `y1` - top left coordinates
     * `x2`, `y2` - bottom right coordinates
     */
    getGraphRect: function () {
      return physicsSimulator.getBBox();
    },

    /*
     * Requests layout algorithm to pin/unpin node to its current position
     * Pinned nodes should not be affected by layout algorithm and always
     * remain at their position
     */
    pinNode: function (node, isPinned) {
      var body = getInitializedBody(node.id);
       body.isPinned = !!isPinned;
    },

    /**
     * Checks whether given graph's node is currently pinned
     */
    isNodePinned: function (node) {
      return getInitializedBody(node.id).isPinned;
    },

    /**
     * Request to release all resources
     */
    dispose: function() {
      graph.off('changed', onGraphChanged);
    },

    /**
     * [Read only] Gets current physics simulator
     */
    simulator: physicsSimulator
  };

  function listenToGraphEvents() {
    graph.on('changed', onGraphChanged);
  }

  function onGraphChanged(changes) {
    for (var i = 0; i < changes.length; ++i) {
      var change = changes[i];
      if (change.changeType === 'add') {
        if (change.node) {
          initBody(change.node.id);
        }
        if (change.link) {
          initLink(change.link);
        }
      } else if (change.changeType === 'remove') {
        if (change.node) {
          releaseNode(change.node);
        }
        if (change.link) {
          releaseLink(change.link);
        }
      }
    }
  }

  function initPhysics() {
    graph.forEachNode(function (node) {
      initBody(node.id);
    });
    graph.forEachLink(initLink);
  }

  function initBody(nodeId) {
    var body = nodeBodies[nodeId];
    if (!body) {
      var node = graph.getNode(nodeId);
      if (!node) {
        throw new Error('initBody() was called with unknown node id');
      }

      var pos = node.position;
      if (!pos) {
        var neighbors = getNeighborBodies(node);
        pos = physicsSimulator.getBestNewBodyPosition(neighbors);
      }

      body = physicsSimulator.addBodyAt(pos);

      nodeBodies[nodeId] = body;
      updateBodyMass(nodeId);

      if (isNodeOriginallyPinned(node)) {
        body.isPinned = true;
      }
    }
  }

  function releaseNode(node) {
    var nodeId = node.id;
    var body = nodeBodies[nodeId];
    if (body) {
      nodeBodies[nodeId] = null;
      delete nodeBodies[nodeId];

      physicsSimulator.removeBody(body);
    }
  }

  function initLink(link) {
    updateBodyMass(link.fromId);
    updateBodyMass(link.toId);

    var fromBody = nodeBodies[link.fromId],
        toBody  = nodeBodies[link.toId],
        spring = physicsSimulator.addSpring(fromBody, toBody, link.length);

    springs[link.id] = spring;
  }

  function releaseLink(link) {
    var spring = springs[link.id];
    if (spring) {
      var from = graph.getNode(link.fromId),
          to = graph.getNode(link.toId);

      if (from) updateBodyMass(from.id);
      if (to) updateBodyMass(to.id);

      delete springs[link.id];

      physicsSimulator.removeSpring(spring);
    }
  }

  function getNeighborBodies(node) {
    // TODO: Could probably be done better on memory
    var neighbors = [];
    if (!node.links) {
      return neighbors;
    }
    var maxNeighbors = Math.min(node.links.length, 2);
    for (var i = 0; i < maxNeighbors; ++i) {
      var link = node.links[i];
      var otherBody = link.fromId !== node.id ? nodeBodies[link.fromId] : nodeBodies[link.toId];
      if (otherBody && otherBody.pos) {
        neighbors.push(otherBody);
      }
    }

    return neighbors;
  }

  function updateBodyMass(nodeId) {
    var body = nodeBodies[nodeId];
    body.mass = nodeMass(nodeId);
  }

  /**
   * Checks whether graph node has in its settings pinned attribute,
   * which means layout algorithm cannot move it. Node can be preconfigured
   * as pinned, if it has "isPinned" attribute, or when node.data has it.
   *
   * @param {Object} node a graph node to check
   * @return {Boolean} true if node should be treated as pinned; false otherwise.
   */
  function isNodeOriginallyPinned(node) {
    return (node && (node.isPinned || (node.data && node.data.isPinned)));
  }

  function getInitializedBody(nodeId) {
    var body = nodeBodies[nodeId];
    if (!body) {
      initBody(nodeId);
      body = nodeBodies[nodeId];
    }
    return body;
  }

  /**
   * Calculates mass of a body, which corresponds to node with given id.
   *
   * @param {String|Number} nodeId identifier of a node, for which body mass needs to be calculated
   * @returns {Number} recommended mass of the body;
   */
  function nodeMass(nodeId) {
    return 1 + graph.getLinks(nodeId).length / 3.0;
  }
}

},{"ngraph.physics.primitives":9,"ngraph.physics.simulator":10}],9:[function(require,module,exports){
module.exports = {
  Body: Body,
  Vector2d: Vector2d,
  Body3d: Body3d,
  Vector3d: Vector3d
};

function Body(x, y) {
  this.pos = new Vector2d(x, y);
  this.prevPos = new Vector2d(x, y);
  this.force = new Vector2d();
  this.velocity = new Vector2d();
  this.mass = 1;
}

function Vector2d(x, y) {
  if (x && typeof x !== 'number') {
    // could be another vector
    this.x = typeof x.x === 'number' ? x.x : 0;
    this.y = typeof x.y === 'number' ? x.y : 0;
  } else {
    this.x = typeof x === 'number' ? x : 0;
    this.y = typeof y === 'number' ? y : 0;
  }
}

Vector2d.prototype.reset = function () {
  this.x = this.y = 0;
};

function Body3d(x, y, z) {
  this.pos = new Vector3d(x, y, z);
  this.prevPos = new Vector3d(x, y, z);
  this.force = new Vector3d();
  this.velocity = new Vector3d();
  this.mass = 1;
}

function Vector3d(x, y, z) {
  if (x && typeof x !== 'number') {
    // could be another vector
    this.x = typeof x.x === 'number' ? x.x : 0;
    this.y = typeof x.y === 'number' ? x.y : 0;
    this.z = typeof x.z === 'number' ? x.z : 0;
  } else {
    this.x = typeof x === 'number' ? x : 0;
    this.y = typeof y === 'number' ? y : 0;
    this.z = typeof z === 'number' ? z : 0;
  }
};

Vector3d.prototype.reset = function () {
  this.x = this.y = this.z = 0;
};

},{}],10:[function(require,module,exports){
/**
 * Manages a simulation of physical forces acting on bodies and springs.
 */
module.exports = physicsSimulator;

function physicsSimulator(settings) {
  var Spring = require('./lib/spring');
  var expose = require('ngraph.expose');
  var merge = require('ngraph.merge');

  settings = merge(settings, {
      /**
       * Ideal length for links (springs in physical model).
       */
      springLength: 30,

      /**
       * Hook's law coefficient. 1 - solid spring.
       */
      springCoeff: 0.0008,

      /**
       * Coulomb's law coefficient. It's used to repel nodes thus should be negative
       * if you make it positive nodes start attract each other :).
       */
      gravity: -1.2,

      /**
       * Theta coeffiecient from Barnes Hut simulation. Ranged between (0, 1).
       * The closer it's to 1 the more nodes algorithm will have to go through.
       * Setting it to one makes Barnes Hut simulation no different from
       * brute-force forces calculation (each node is considered).
       */
      theta: 0.8,

      /**
       * Drag force coefficient. Used to slow down system, thus should be less than 1.
       * The closer it is to 0 the less tight system will be.
       */
      dragCoeff: 0.02,

      /**
       * Default time step (dt) for forces integration
       */
      timeStep : 20
  });

  // We allow clients to override basic factory methods:
  var createQuadTree = settings.createQuadTree || require('ngraph.quadtreebh');
  var createBounds = settings.createBounds || require('./lib/bounds');
  var createDragForce = settings.createDragForce || require('./lib/dragForce');
  var createSpringForce = settings.createSpringForce || require('./lib/springForce');
  var integrate = settings.integrator || require('./lib/eulerIntegrator');
  var createBody = settings.createBody || require('./lib/createBody');

  var bodies = [], // Bodies in this simulation.
      springs = [], // Springs in this simulation.
      quadTree =  createQuadTree(settings),
      bounds = createBounds(bodies, settings),
      springForce = createSpringForce(settings),
      dragForce = createDragForce(settings);

  var publicApi = {
    /**
     * Array of bodies, registered with current simulator
     *
     * Note: To add new body, use addBody() method. This property is only
     * exposed for testing/performance purposes.
     */
    bodies: bodies,

    /**
     * Performs one step of force simulation.
     *
     * @returns {Number} Total movement of the system. Calculated as:
     *   (total distance traveled by bodies)^2/(total # of bodies)
     */
    step: function () {
      accumulateForces();
      var totalMovement = integrate(bodies, settings.timeStep);

      bounds.update();

      return totalMovement;
    },

    /**
     * Adds body to the system
     *
     * @param {ngraph.physics.primitives.Body} body physical body
     *
     * @returns {ngraph.physics.primitives.Body} added body
     */
    addBody: function (body) {
      if (!body) {
        throw new Error('Body is required');
      }
      bodies.push(body);

      return body;
    },

    /**
     * Adds body to the system at given position
     *
     * @param {Object} pos position of a body
     *
     * @returns {ngraph.physics.primitives.Body} added body
     */
    addBodyAt: function (pos) {
      if (!pos) {
        throw new Error('Body position is required');
      }
      var body = createBody(pos);
      bodies.push(body);

      return body;
    },

    /**
     * Removes body from the system
     *
     * @param {ngraph.physics.primitives.Body} body to remove
     *
     * @returns {Boolean} true if body found and removed. falsy otherwise;
     */
    removeBody: function (body) {
      if (!body) { return; }

      var idx = bodies.indexOf(body);
      if (idx < 0) { return; }

      bodies.splice(idx, 1);
      if (bodies.length === 0) {
        bounds.reset();
      }
      return true;
    },

    /**
     * Adds a spring to this simulation.
     *
     * @returns {Object} - a handle for a spring. If you want to later remove
     * spring pass it to removeSpring() method.
     */
    addSpring: function (body1, body2, springLength, springWeight, springCoefficient) {
      if (!body1 || !body2) {
        throw new Error('Cannot add null spring to force simulator');
      }

      if (typeof springLength !== 'number') {
        springLength = -1; // assume global configuration
      }

      var spring = new Spring(body1, body2, springLength, springCoefficient >= 0 ? springCoefficient : -1, springWeight);
      springs.push(spring);

      // TODO: could mark simulator as dirty.
      return spring;
    },

    /**
     * Removes spring from the system
     *
     * @param {Object} spring to remove. Spring is an object returned by addSpring
     *
     * @returns {Boolean} true if spring found and removed. falsy otherwise;
     */
    removeSpring: function (spring) {
      if (!spring) { return; }
      var idx = springs.indexOf(spring);
      if (idx > -1) {
        springs.splice(idx, 1);
        return true;
      }
    },

    getBestNewBodyPosition: function (neighbors) {
      return bounds.getBestNewPosition(neighbors);
    },

    /**
     * Returns bounding box which covers all bodies
     */
    getBBox: function () {
      return bounds.box;
    },

    gravity: function (value) {
      if (value !== undefined) {
        settings.gravity = value;
        quadTree.options({gravity: value});
        return this;
      } else {
        return settings.gravity;
      }
    },

    theta: function (value) {
      if (value !== undefined) {
        settings.theta = value;
        quadTree.options({theta: value});
        return this;
      } else {
        return settings.theta;
      }
    }
  }

  // allow settings modification via public API:
  expose(settings, publicApi);

  return publicApi;

  function accumulateForces() {
    // Accumulate forces acting on bodies.
    var body,
        i = bodies.length;

    if (i) {
      // only add bodies if there the array is not empty:
      quadTree.insertBodies(bodies); // performance: O(n * log n)
      while (i--) {
        body = bodies[i];
        body.force.reset();

        quadTree.updateBodyForce(body);
        dragForce.update(body);
      }
    }

    i = springs.length;
    while(i--) {
      springForce.update(springs[i]);
    }
  }
};

},{"./lib/bounds":11,"./lib/createBody":12,"./lib/dragForce":13,"./lib/eulerIntegrator":14,"./lib/spring":15,"./lib/springForce":16,"ngraph.expose":17,"ngraph.merge":25,"ngraph.quadtreebh":18}],11:[function(require,module,exports){
module.exports = function (bodies, settings) {
  var random = require('ngraph.random').random(42);
  var boundingBox =  { x1: 0, y1: 0, x2: 0, y2: 0 };

  return {
    box: boundingBox,

    update: updateBoundingBox,

    reset : function () {
      boundingBox.x1 = boundingBox.y1 = 0;
      boundingBox.x2 = boundingBox.y2 = 0;
    },

    getBestNewPosition: function (neighbors) {
      var graphRect = boundingBox;

      var baseX = 0, baseY = 0;

      if (neighbors.length) {
        for (var i = 0; i < neighbors.length; ++i) {
          baseX += neighbors[i].pos.x;
          baseY += neighbors[i].pos.y;
        }

        baseX /= neighbors.length;
        baseY /= neighbors.length;
      } else {
        baseX = (graphRect.x1 + graphRect.x2) / 2;
        baseY = (graphRect.y1 + graphRect.y2) / 2;
      }

      var springLength = settings.springLength;
      return {
        x: baseX + random.next(springLength) - springLength / 2,
        y: baseY + random.next(springLength) - springLength / 2
      };
    }
  };

  function updateBoundingBox() {
    var i = bodies.length;
    if (i === 0) { return; } // don't have to wory here.

    var x1 = Number.MAX_VALUE,
        y1 = Number.MAX_VALUE,
        x2 = Number.MIN_VALUE,
        y2 = Number.MIN_VALUE;

    while(i--) {
      // this is O(n), could it be done faster with quadtree?
      // how about pinned nodes?
      var body = bodies[i];
      if (body.isPinned) {
        body.pos.x = body.prevPos.x;
        body.pos.y = body.prevPos.y;
      } else {
        body.prevPos.x = body.pos.x;
        body.prevPos.y = body.pos.y;
      }
      if (body.pos.x < x1) {
        x1 = body.pos.x;
      }
      if (body.pos.x > x2) {
        x2 = body.pos.x;
      }
      if (body.pos.y < y1) {
        y1 = body.pos.y;
      }
      if (body.pos.y > y2) {
        y2 = body.pos.y;
      }
    }

    boundingBox.x1 = x1;
    boundingBox.x2 = x2;
    boundingBox.y1 = y1;
    boundingBox.y2 = y2;
  }
}

},{"ngraph.random":22}],12:[function(require,module,exports){
var physics = require('ngraph.physics.primitives');

module.exports = function(pos) {
  return new physics.Body(pos);
}

},{"ngraph.physics.primitives":9}],13:[function(require,module,exports){
/**
 * Represents drag force, which reduces force value on each step by given
 * coefficient.
 *
 * @param {Object} options for the drag force
 * @param {Number=} options.dragCoeff drag force coefficient. 0.1 by default
 */
module.exports = function (options) {
  var merge = require('ngraph.merge'),
      expose = require('ngraph.expose');

  options = merge(options, {
    dragCoeff: 0.02
  });

  var api = {
    update : function (body) {
      body.force.x -= options.dragCoeff * body.velocity.x;
      body.force.y -= options.dragCoeff * body.velocity.y;
    }
  };

  // let easy access to dragCoeff:
  expose(options, api, ['dragCoeff']);

  return api;
};

},{"ngraph.expose":17,"ngraph.merge":25}],14:[function(require,module,exports){
/**
 * Performs forces integration, using given timestep. Uses Euler method to solve
 * differential equation (http://en.wikipedia.org/wiki/Euler_method ).
 *
 * @returns {Number} squared distance of total position updates.
 */

module.exports = integrate;

function integrate(bodies, timeStep) {
  var dx = 0, tx = 0,
      dy = 0, ty = 0,
      i,
      max = bodies.length;

  for (i = 0; i < max; ++i) {
    var body = bodies[i],
        coeff = timeStep / body.mass;

    body.velocity.x += coeff * body.force.x;
    body.velocity.y += coeff * body.force.y;
    var vx = body.velocity.x,
        vy = body.velocity.y,
        v = Math.sqrt(vx * vx + vy * vy);

    if (v > 1) {
      body.velocity.x = vx / v;
      body.velocity.y = vy / v;
    }

    dx = timeStep * body.velocity.x;
    dy = timeStep * body.velocity.y;

    body.pos.x += dx;
    body.pos.y += dy;

    // TODO: this is not accurate. Total value should be absolute
    tx += dx; ty += dy;
  }

  return (tx * tx + ty * ty)/bodies.length;
}

},{}],15:[function(require,module,exports){
module.exports = Spring;

/**
 * Represents a physical spring. Spring connects two bodies, has rest length
 * stiffness coefficient and optional weight
 */
function Spring(fromBody, toBody, length, coeff, weight) {
    this.from = fromBody;
    this.to = toBody;
    this.length = length;
    this.coeff = coeff;

    this.weight = typeof weight === 'number' ? weight : 1;
};

},{}],16:[function(require,module,exports){
/**
 * Represents spring force, which updates forces acting on two bodies, conntected
 * by a spring.
 *
 * @param {Object} options for the spring force
 * @param {Number=} options.springCoeff spring force coefficient.
 * @param {Number=} options.springLength desired length of a spring at rest.
 */
module.exports = function (options) {
  var merge = require('ngraph.merge');
  var random = require('ngraph.random').random(42);
  var expose = require('ngraph.expose');

  options = merge(options, {
    springCoeff: 0.0002,
    springLength: 80
  });

  var api = {
    /**
     * Upsates forces acting on a spring
     */
    update : function (spring) {
      var body1 = spring.from,
          body2 = spring.to,
          length = spring.length < 0 ? options.springLength : spring.length,
          dx = body2.pos.x - body1.pos.x,
          dy = body2.pos.y - body1.pos.y,
          r = Math.sqrt(dx * dx + dy * dy);

      if (r === 0) {
          dx = (random.nextDouble() - 0.5) / 50;
          dy = (random.nextDouble() - 0.5) / 50;
          r = Math.sqrt(dx * dx + dy * dy);
      }

      var d = r - length;
      var coeff = ((!spring.coeff || spring.coeff < 0) ? options.springCoeff : spring.coeff) * d / r * spring.weight;

      body1.force.x += coeff * dx;
      body1.force.y += coeff * dy;

      body2.force.x -= coeff * dx;
      body2.force.y -= coeff * dy;
    }
  };

  expose(options, api, ['springCoeff', 'springLength']);
  return api;
}

},{"ngraph.expose":17,"ngraph.merge":25,"ngraph.random":22}],17:[function(require,module,exports){
module.exports = exposeProperties;

/**
 * Augments `target` object with getter/setter functions, which modify settings
 *
 * @example
 *  var target = {};
 *  exposeProperties({ age: 42}, target);
 *  target.age(); // returns 42
 *  target.age(24); // make age 24;
 *
 *  var filteredTarget = {};
 *  exposeProperties({ age: 42, name: 'John'}, filteredTarget, ['name']);
 *  filteredTarget.name(); // returns 'John'
 *  filteredTarget.age === undefined; // true
 */
function exposeProperties(settings, target, filter) {
  var needsFilter = Object.prototype.toString.call(filter) === '[object Array]';
  if (needsFilter) {
    for (var i = 0; i < filter.length; ++i) {
      augment(settings, target, filter[i]);
    }
  } else {
    for (var key in settings) {
      augment(settings, target, key);
    }
  }
}

function augment(source, target, key) {
  if (source.hasOwnProperty(key)) {
    if (typeof target[key] === 'function') {
      // this accessor is already defined. Ignore it
      return;
    }
    target[key] = function (value) {
      if (value !== undefined) {
        source[key] = value;
        return target;
      }
      return source[key];
    }
  }
}

},{}],18:[function(require,module,exports){
/**
 * This is Barnes Hut simulation algorithm. Implementation
 * is adopted to non-recursive solution, since certain browsers
 * handle recursion extremly bad.
 *
 * http://www.cs.princeton.edu/courses/archive/fall03/cs126/assignments/barnes-hut.html
 */

module.exports = function (options) {
    options = options || {};
    options.gravity = typeof options.gravity === 'number' ? options.gravity : -1;
    options.theta = typeof options.theta === 'number' ? options.theta : 0.8;

    // we require deterministic randomness here
    var random = require('ngraph.random').random(1984),
        Node = require('./node'),
        InsertStack = require('./insertStack'),
        isSamePosition = require('./isSamePosition');

    var gravity = options.gravity,
        updateQueue = [],
        insertStack = new InsertStack(),
        theta = options.theta,

        nodesCache = [],
        currentInCache = 0,
        newNode = function () {
            // To avoid pressure on GC we reuse nodes.
            var node = nodesCache[currentInCache];
            if (node) {
                node.quads[0] = null;
                node.quads[1] = null;
                node.quads[2] = null;
                node.quads[3] = null;
                node.body = null;
                node.mass = node.massX = node.massY = 0;
                node.left = node.right = node.top = node.bottom = 0;
            } else {
                node = new Node();
                nodesCache[currentInCache] = node;
            }

            ++currentInCache;
            return node;
        },

        root = newNode(),

        // Inserts body to the tree
        insert = function (newBody) {
            insertStack.reset();
            insertStack.push(root, newBody);

            while (!insertStack.isEmpty()) {
                var stackItem = insertStack.pop(),
                    node = stackItem.node,
                    body = stackItem.body;

                if (!node.body) {
                    // This is internal node. Update the total mass of the node and center-of-mass.
                    var x = body.pos.x;
                    var y = body.pos.y;
                    node.mass = node.mass + body.mass;
                    node.massX = node.massX + body.mass * x;
                    node.massY = node.massY + body.mass * y;

                    // Recursively insert the body in the appropriate quadrant.
                    // But first find the appropriate quadrant.
                    var quadIdx = 0, // Assume we are in the 0's quad.
                        left = node.left,
                        right = (node.right + left) / 2,
                        top = node.top,
                        bottom = (node.bottom + top) / 2;

                    if (x > right) { // somewhere in the eastern part.
                        quadIdx = quadIdx + 1;
                        var oldLeft = left;
                        left = right;
                        right = right + (right - oldLeft);
                    }
                    if (y > bottom) { // and in south.
                        quadIdx = quadIdx + 2;
                        var oldTop = top;
                        top = bottom;
                        bottom = bottom + (bottom - oldTop);
                    }

                    var child = node.quads[quadIdx];
                    if (!child) {
                        // The node is internal but this quadrant is not taken. Add
                        // subnode to it.
                        child = newNode();
                        child.left = left;
                        child.top = top;
                        child.right = right;
                        child.bottom = bottom;
                        child.body = body;

                        node.quads[quadIdx] = child;
                    } else {
                        // continue searching in this quadrant.
                        insertStack.push(child, body);
                    }
                } else {
                    // We are trying to add to the leaf node.
                    // We have to convert current leaf into internal node
                    // and continue adding two nodes.
                    var oldBody = node.body;
                    node.body = null; // internal nodes do not cary bodies

                    if (isSamePosition(oldBody.pos, body.pos)) {
                        // Prevent infinite subdivision by bumping one node
                        // anywhere in this quadrant
                        if (node.right - node.left < 1e-8) {
                            // This is very bad, we ran out of precision.
                            // if we do not return from the method we'll get into
                            // infinite loop here. So we sacrifice correctness of layout, and keep the app running
                            // Next layout iteration should get larger bounding box in the first step and fix this
                            return;
                        }
                        do {
                            var offset = random.nextDouble();
                            var dx = (node.right - node.left) * offset;
                            var dy = (node.bottom - node.top) * offset;

                            oldBody.pos.x = node.left + dx;
                            oldBody.pos.y = node.top + dy;
                            // Make sure we don't bump it out of the box. If we do, next iteration should fix it
                        } while (isSamePosition(oldBody.pos, body.pos));

                    }
                    // Next iteration should subdivide node further.
                    insertStack.push(node, oldBody);
                    insertStack.push(node, body);
                }
           }
        },

        update = function (sourceBody) {
            var queue = updateQueue,
                v,
                dx,
                dy,
                r,
                queueLength = 1,
                shiftIdx = 0,
                pushIdx = 1;

            queue[0] = root;

            while (queueLength) {
                var node = queue[shiftIdx],
                    body = node.body;

                queueLength -= 1;
                shiftIdx += 1;
                // technically there should be external "if (body !== sourceBody) {"
                // but in practice it gives slightghly worse performance, and does not
                // have impact on layout correctness
                if (body && body !== sourceBody) {
                    // If the current node is a leaf node (and it is not source body),
                    // calculate the force exerted by the current node on body, and add this
                    // amount to body's net force.
                    dx = body.pos.x - sourceBody.pos.x;
                    dy = body.pos.y - sourceBody.pos.y;
                    r = Math.sqrt(dx * dx + dy * dy);

                    if (r === 0) {
                        // Poor man's protection against zero distance.
                        dx = (random.nextDouble() - 0.5) / 50;
                        dy = (random.nextDouble() - 0.5) / 50;
                        r = Math.sqrt(dx * dx + dy * dy);
                    }

                    // This is standard gravition force calculation but we divide
                    // by r^3 to save two operations when normalizing force vector.
                    v = gravity * body.mass * sourceBody.mass / (r * r * r);
                    sourceBody.force.x += v * dx;
                    sourceBody.force.y += v * dy;
                } else {
                    // Otherwise, calculate the ratio s / r,  where s is the width of the region
                    // represented by the internal node, and r is the distance between the body
                    // and the node's center-of-mass
                    dx = node.massX / node.mass - sourceBody.pos.x;
                    dy = node.massY / node.mass - sourceBody.pos.y;
                    r = Math.sqrt(dx * dx + dy * dy);

                    if (r === 0) {
                        // Sorry about code duplucation. I don't want to create many functions
                        // right away. Just want to see performance first.
                        dx = (random.nextDouble() - 0.5) / 50;
                        dy = (random.nextDouble() - 0.5) / 50;
                        r = Math.sqrt(dx * dx + dy * dy);
                    }
                    // If s / r < θ, treat this internal node as a single body, and calculate the
                    // force it exerts on body b, and add this amount to b's net force.
                    if ((node.right - node.left) / r < theta) {
                        // in the if statement above we consider node's width only
                        // because the region was squarified during tree creation.
                        // Thus there is no difference between using width or height.
                        v = gravity * node.mass * sourceBody.mass / (r * r * r);
                        sourceBody.force.x += v * dx;
                        sourceBody.force.y += v * dy;
                    } else {
                        // Otherwise, run the procedure recursively on each of the current node's children.

                        // I intentionally unfolded this loop, to save several CPU cycles.
                        if (node.quads[0]) { queue[pushIdx] = node.quads[0]; queueLength += 1; pushIdx += 1; }
                        if (node.quads[1]) { queue[pushIdx] = node.quads[1]; queueLength += 1; pushIdx += 1; }
                        if (node.quads[2]) { queue[pushIdx] = node.quads[2]; queueLength += 1; pushIdx += 1; }
                        if (node.quads[3]) { queue[pushIdx] = node.quads[3]; queueLength += 1; pushIdx += 1; }
                    }
                }
            }
        },

        insertBodies = function (bodies) {
            var x1 = Number.MAX_VALUE,
                y1 = Number.MAX_VALUE,
                x2 = Number.MIN_VALUE,
                y2 = Number.MIN_VALUE,
                i,
                max = bodies.length;

            // To reduce quad tree depth we are looking for exact bounding box of all particles.
            i = max;
            while (i--) {
                var x = bodies[i].pos.x;
                var y = bodies[i].pos.y;
                if (x < x1) { x1 = x; }
                if (x > x2) { x2 = x; }
                if (y < y1) { y1 = y; }
                if (y > y2) { y2 = y; }
            }

            // Squarify the bounds.
            var dx = x2 - x1,
                dy = y2 - y1;
            if (dx > dy) { y2 = y1 + dx; } else { x2 = x1 + dy; }

            currentInCache = 0;
            root = newNode();
            root.left = x1;
            root.right = x2;
            root.top = y1;
            root.bottom = y2;

            i = max - 1;
            if (i > 0) {
              root.body = bodies[i];
            }
            while (i--) {
                insert(bodies[i], root);
            }
        };

    return {
        insertBodies : insertBodies,
        updateBodyForce : update,
        options : function (newOptions) {
            if (newOptions) {
                if (typeof newOptions.gravity === 'number') { gravity = newOptions.gravity; }
                if (typeof newOptions.theta === 'number') { theta = newOptions.theta; }

                return this;
            }

            return {gravity : gravity, theta : theta};
        }
    };
};


},{"./insertStack":19,"./isSamePosition":20,"./node":21,"ngraph.random":22}],19:[function(require,module,exports){
module.exports = InsertStack;

/**
 * Our implmentation of QuadTree is non-recursive (recursion handled not really
 * well in old browsers). This data structure represent stack of elemnts
 * which we are trying to insert into quad tree. It also avoids unnecessary
 * memory pressue when we are adding more elements
 */
function InsertStack () {
    this.stack = [];
    this.popIdx = 0;
}

InsertStack.prototype = {
    isEmpty: function() {
        return this.popIdx === 0;
    },
    push: function (node, body) {
        var item = this.stack[this.popIdx];
        if (!item) {
            // we are trying to avoid memory pressue: create new element
            // only when absolutely necessary
            this.stack[this.popIdx] = new InsertStackElement(node, body);
        } else {
            item.node = node;
            item.body = body;
        }
        ++this.popIdx;
    },
    pop: function () {
        if (this.popIdx > 0) {
            return this.stack[--this.popIdx];
        }
    },
    reset: function () {
        this.popIdx = 0;
    }
};

function InsertStackElement(node, body) {
    this.node = node; // QuadTree node
    this.body = body; // physical body which needs to be inserted to node
}

},{}],20:[function(require,module,exports){
module.exports = function isSamePosition(point1, point2) {
    var dx = Math.abs(point1.x - point2.x);
    var dy = Math.abs(point1.y - point2.y);

    return (dx < 1e-8 && dy < 1e-8);
};

},{}],21:[function(require,module,exports){
/**
 * Internal data structure to represent 2D QuadTree node
 */
module.exports = function Node() {
  // body stored inside this node. In quad tree only leaf nodes (by construction)
  // contain boides:
  this.body = null;

  // Child nodes are stored in quads. Each quad is presented by number:
  // 0 | 1
  // -----
  // 2 | 3
  this.quads = [];

  // Total mass of current node
  this.mass = 0;

  // Center of mass coordinates
  this.massX = 0;
  this.massY = 0;

  // bounding box coordinates
  this.left = 0;
  this.top = 0;
  this.bottom = 0;
  this.right = 0;

  // Node is internal when it is not a leaf
  this.isInternal = false;
};

},{}],22:[function(require,module,exports){
module.exports = {
  random: random,
  randomIterator: randomIterator
};

/**
 * Creates seeded PRNG with two methods:
 *   next() and nextDouble()
 */
function random(inputSeed) {
  var seed = typeof inputSeed === 'number' ? inputSeed : (+ new Date());
  var randomFunc = function() {
      // Robert Jenkins' 32 bit integer hash function.
      seed = ((seed + 0x7ed55d16) + (seed << 12))  & 0xffffffff;
      seed = ((seed ^ 0xc761c23c) ^ (seed >>> 19)) & 0xffffffff;
      seed = ((seed + 0x165667b1) + (seed << 5))   & 0xffffffff;
      seed = ((seed + 0xd3a2646c) ^ (seed << 9))   & 0xffffffff;
      seed = ((seed + 0xfd7046c5) + (seed << 3))   & 0xffffffff;
      seed = ((seed ^ 0xb55a4f09) ^ (seed >>> 16)) & 0xffffffff;
      return (seed & 0xfffffff) / 0x10000000;
  };

  return {
      /**
       * Generates random integer number in the range from 0 (inclusive) to maxValue (exclusive)
       *
       * @param maxValue Number REQUIRED. Ommitting this number will result in NaN values from PRNG.
       */
      next : function (maxValue) {
          return Math.floor(randomFunc() * maxValue);
      },

      /**
       * Generates random double number in the range from 0 (inclusive) to 1 (exclusive)
       * This function is the same as Math.random() (except that it could be seeded)
       */
      nextDouble : function () {
          return randomFunc();
      }
  };
}

/*
 * Creates iterator over array, which returns items of array in random order
 * Time complexity is guaranteed to be O(n);
 */
function randomIterator(array, customRandom) {
    var localRandom = customRandom || random();
    if (typeof localRandom.next !== 'function') {
      throw new Error('customRandom does not match expected API: next() function is missing');
    }

    return {
        forEach : function (callback) {
            var i, j, t;
            for (i = array.length - 1; i > 0; --i) {
                j = localRandom.next(i + 1); // i inclusive
                t = array[j];
                array[j] = array[i];
                array[i] = t;

                callback(t);
            }

            if (array.length) {
                callback(array[0]);
            }
        },

        /**
         * Shuffles array randomly, in place.
         */
        shuffle : function () {
            var i, j, t;
            for (i = array.length - 1; i > 0; --i) {
                j = localRandom.next(i + 1); // i inclusive
                t = array[j];
                array[j] = array[i];
                array[i] = t;
            }

            return array;
        }
    };
}

},{}],23:[function(require,module,exports){
/**
 * @fileOverview Contains definition of the core graph object.
 */


/**
 * @example
 *  var graph = require('ngraph.graph')();
 *  graph.addNode(1);     // graph has one node.
 *  graph.addLink(2, 3);  // now graph contains three nodes and one link.
 *
 */
module.exports = function () {
    // Graph structure is maintained as dictionary of nodes
    // and array of links. Each node has 'links' property which
    // hold all links related to that node. And general links
    // array is used to speed up all links enumeration. This is inefficient
    // in terms of memory, but simplifies coding.

    var nodes = typeof Object.create === 'function' ? Object.create(null) : {},
        links = [],
        // Hash of multi-edges. Used to track ids of edges between same nodes
        multiEdges = {},
        nodesCount = 0,
        suspendEvents = 0,

        // Accumlates all changes made during graph updates.
        // Each change element contains:
        //  changeType - one of the strings: 'add', 'remove' or 'update';
        //  node - if change is related to node this property is set to changed graph's node;
        //  link - if change is related to link this property is set to changed graph's link;
        changes = [],

        fireGraphChanged = function (graph) {
            graph.fire('changed', changes);
        },

        // Enter, Exit Mofidication allows bulk graph updates without firing events.
        enterModification = function () {
            suspendEvents += 1;
        },

        exitModification = function (graph) {
            suspendEvents -= 1;
            if (suspendEvents === 0 && changes.length > 0) {
                fireGraphChanged(graph);
                changes.length = 0;
            }
        },

        recordNodeChange = function (node, changeType) {
            changes.push({node : node, changeType : changeType});
        },

        recordLinkChange = function (link, changeType) {
            changes.push({link : link, changeType : changeType});
        },
        linkConnectionSymbol = '👉 ';

    var graphPart = {

        /**
         * Adds node to the graph. If node with given id already exists in the graph
         * its data is extended with whatever comes in 'data' argument.
         *
         * @param nodeId the node's identifier. A string or number is preferred.
         *   note: Node id should not contain 'linkConnectionSymbol'. This will break link identifiers
         * @param [data] additional data for the node being added. If node already
         *   exists its data object is augmented with the new one.
         *
         * @return {node} The newly added node or node with given id if it already exists.
         */
        addNode : function (nodeId, data) {
            if (typeof nodeId === 'undefined') {
                throw new Error('Invalid node identifier');
            }

            enterModification();

            var node = this.getNode(nodeId);
            if (!node) {
                // TODO: Should I check for linkConnectionSymbol here?
                node = new Node(nodeId);
                nodesCount++;

                recordNodeChange(node, 'add');
            } else {
                recordNodeChange(node, 'update');
            }

            node.data = data;

            nodes[nodeId] = node;

            exitModification(this);
            return node;
        },

        /**
         * Adds a link to the graph. The function always create a new
         * link between two nodes. If one of the nodes does not exists
         * a new node is created.
         *
         * @param fromId link start node id;
         * @param toId link end node id;
         * @param [data] additional data to be set on the new link;
         *
         * @return {link} The newly created link
         */
        addLink : function (fromId, toId, data) {
            enterModification();

            var fromNode = this.getNode(fromId) || this.addNode(fromId);
            var toNode = this.getNode(toId) || this.addNode(toId);

            var linkId = fromId.toString() + linkConnectionSymbol + toId.toString();
            var isMultiEdge = multiEdges.hasOwnProperty(linkId);
            if (isMultiEdge || this.hasLink(fromId, toId)) {
                if (!isMultiEdge) {
                    multiEdges[linkId] = 0;
                }
                linkId += '@' + (++multiEdges[linkId]);
            }

            var link = new Link(fromId, toId, data, linkId);

            links.push(link);

            // TODO: this is not cool. On large graphs potentially would consume more memory.
            fromNode.links.push(link);
            toNode.links.push(link);

            recordLinkChange(link, 'add');

            exitModification(this);

            return link;
        },

        /**
         * Removes link from the graph. If link does not exist does nothing.
         *
         * @param link - object returned by addLink() or getLinks() methods.
         *
         * @returns true if link was removed; false otherwise.
         */
        removeLink : function (link) {
            if (!link) { return false; }
            var idx = indexOfElementInArray(link, links);
            if (idx < 0) { return false; }

            enterModification();

            links.splice(idx, 1);

            var fromNode = this.getNode(link.fromId);
            var toNode = this.getNode(link.toId);

            if (fromNode) {
                idx = indexOfElementInArray(link, fromNode.links);
                if (idx >= 0) {
                    fromNode.links.splice(idx, 1);
                }
            }

            if (toNode) {
                idx = indexOfElementInArray(link, toNode.links);
                if (idx >= 0) {
                    toNode.links.splice(idx, 1);
                }
            }

            recordLinkChange(link, 'remove');

            exitModification(this);

            return true;
        },

        /**
         * Removes node with given id from the graph. If node does not exist in the graph
         * does nothing.
         *
         * @param nodeId node's identifier passed to addNode() function.
         *
         * @returns true if node was removed; false otherwise.
         */
        removeNode: function (nodeId) {
            var node = this.getNode(nodeId);
            if (!node) { return false; }

            enterModification();

            while (node.links.length) {
                var link = node.links[0];
                this.removeLink(link);
            }

            delete nodes[nodeId];
            nodesCount--;

            recordNodeChange(node, 'remove');

            exitModification(this);

            return true;
        },

        /**
         * Gets node with given identifier. If node does not exist undefined value is returned.
         *
         * @param nodeId requested node identifier;
         *
         * @return {node} in with requested identifier or undefined if no such node exists.
         */
        getNode : function (nodeId) {
            return nodes[nodeId];
        },

        /**
         * Gets number of nodes in this graph.
         *
         * @return number of nodes in the graph.
         */
        getNodesCount : function () {
            return nodesCount;
        },

        /**
         * Gets total number of links in the graph.
         */
        getLinksCount : function () {
            return links.length;
        },

        /**
         * Gets all links (inbound and outbound) from the node with given id.
         * If node with given id is not found null is returned.
         *
         * @param nodeId requested node identifier.
         *
         * @return Array of links from and to requested node if such node exists;
         *   otherwise null is returned.
         */
        getLinks : function (nodeId) {
            var node = this.getNode(nodeId);
            return node ? node.links : null;
        },

        /**
         * Invokes callback on each node of the graph.
         *
         * @param {Function(node)} callback Function to be invoked. The function
         *   is passed one argument: visited node.
         */
        forEachNode : function (callback) {
            if (typeof callback !== 'function') {
                return;
            }
            var node;

            for (node in nodes) {
                if (callback(nodes[node])) {
                    return; // client doesn't want to proceed. return.
                }
            }
        },

        /**
         * Invokes callback on every linked (adjacent) node to the given one.
         *
         * @param nodeId Identifier of the requested node.
         * @param {Function(node, link)} callback Function to be called on all linked nodes.
         *   The function is passed two parameters: adjacent node and link object itself.
         * @param oriented if true graph treated as oriented.
         */
        forEachLinkedNode : function (nodeId, callback, oriented) {
            var node = this.getNode(nodeId),
                i,
                link,
                linkedNodeId;

            if (node && node.links && typeof callback === 'function') {
                // Extraced orientation check out of the loop to increase performance
                if (oriented) {
                    for (i = 0; i < node.links.length; ++i) {
                        link = node.links[i];
                        if (link.fromId === nodeId) {
                            callback(nodes[link.toId], link);
                        }
                    }
                } else {
                    for (i = 0; i < node.links.length; ++i) {
                        link = node.links[i];
                        linkedNodeId = link.fromId === nodeId ? link.toId : link.fromId;

                        callback(nodes[linkedNodeId], link);
                    }
                }
            }
        },

        /**
         * Enumerates all links in the graph
         *
         * @param {Function(link)} callback Function to be called on all links in the graph.
         *   The function is passed one parameter: graph's link object.
         *
         * Link object contains at least the following fields:
         *  fromId - node id where link starts;
         *  toId - node id where link ends,
         *  data - additional data passed to graph.addLink() method.
         */
        forEachLink : function (callback) {
            var i, length;
            if (typeof callback === 'function') {
                for (i = 0, length = links.length; i < length; ++i) {
                    callback(links[i]);
                }
            }
        },

        /**
         * Suspend all notifications about graph changes until
         * endUpdate is called.
         */
        beginUpdate : function () {
            enterModification();
        },

        /**
         * Resumes all notifications about graph changes and fires
         * graph 'changed' event in case there are any pending changes.
         */
        endUpdate : function () {
            exitModification(this);
        },

        /**
         * Removes all nodes and links from the graph.
         */
        clear : function () {
            var that = this;
            that.beginUpdate();
            that.forEachNode(function (node) { that.removeNode(node.id); });
            that.endUpdate();
        },

        /**
         * Detects whether there is a link between two nodes.
         * Operation complexity is O(n) where n - number of links of a node.
         *
         * @returns link if there is one. null otherwise.
         */
        hasLink : function (fromNodeId, toNodeId) {
            // TODO: Use adjacency matrix to speed up this operation.
            var node = this.getNode(fromNodeId),
                i;
            if (!node) {
                return null;
            }

            for (i = 0; i < node.links.length; ++i) {
                var link = node.links[i];
                if (link.fromId === fromNodeId && link.toId === toNodeId) {
                    return link;
                }
            }

            return null; // no link.
        }
    };

    // Let graph fire events before we return it to the caller.
    var eventify = require('ngraph.events');
    eventify(graphPart);

    return graphPart;
};

// need this for old browsers. Should this be a separate module?
function indexOfElementInArray(element, array) {
    if (array.indexOf) {
        return array.indexOf(element);
    }

    var len = array.length,
        i;

    for (i = 0; i < len; i += 1) {
        if (array[i] === element) {
            return i;
        }
    }

    return -1;
}

/**
 * Internal structure to represent node;
 */
function Node(id) {
    this.id = id;
    this.links = [];
    this.data = null;
}


/**
 * Internal structure to represent links;
 */
function Link(fromId, toId, data, id) {
    this.fromId = fromId;
    this.toId = toId;
    this.data = data;
    this.id = id;
}

},{"ngraph.events":24}],24:[function(require,module,exports){
module.exports = function(subject) {
  validateSubject(subject);

  var eventsStorage = createEventsStorage(subject);
  subject.on = eventsStorage.on;
  subject.off = eventsStorage.off;
  subject.fire = eventsStorage.fire;
  return subject;
};

function createEventsStorage(subject) {
  // Store all event listeners to this hash. Key is event name, value is array
  // of callback records.
  //
  // A callback record consists of callback function and its optional context:
  // { 'eventName' => [{callback: function, ctx: object}] }
  var registeredEvents = {};

  return {
    on: function (eventName, callback, ctx) {
      if (typeof callback !== 'function') {
        throw new Error('callback is expected to be a function');
      }
      if (!registeredEvents.hasOwnProperty(eventName)) {
        registeredEvents[eventName] = [];
      }
      registeredEvents[eventName].push({callback: callback, ctx: ctx});

      return subject;
    },

    off: function (eventName, callback) {
      var wantToRemoveAll = (typeof eventName === 'undefined');
      if (wantToRemoveAll) {
        // Killing old events storage should be enough in this case:
        registeredEvents = {};
        return subject;
      }

      if (registeredEvents.hasOwnProperty(eventName)) {
        var deleteAllCallbacksForEvent = (typeof callback !== 'function');
        if (deleteAllCallbacksForEvent) {
          delete registeredEvents[eventName];
        } else {
          var callbacks = registeredEvents[eventName];
          for (var i = 0; i < callbacks.length; ++i) {
            if (callbacks[i].callback === callback) {
              callbacks.splice(i, 1);
            }
          }
        }
      }

      return subject;
    },

    fire: function (eventName) {
      var noEventsToFire = !registeredEvents.hasOwnProperty(eventName);
      if (noEventsToFire) {
        return subject; 
      }

      var callbacks = registeredEvents[eventName];
      var fireArguments = Array.prototype.splice.call(arguments, 1);
      for(var i = 0; i < callbacks.length; ++i) {
        var callbackInfo = callbacks[i];
        callbackInfo.callback.apply(callbackInfo.ctx, fireArguments);
      }

      return subject;
    }
  };
}

function validateSubject(subject) {
  if (!subject) {
    throw new Error('Eventify cannot use falsy object as events subject');
  }
  var reservedWords = ['on', 'fire', 'off'];
  for (var i = 0; i < reservedWords.length; ++i) {
    if (subject.hasOwnProperty(reservedWords[i])) {
      throw new Error("Subject cannot be eventified, since it already has property '" + reservedWords[i] + "'");
    }
  }
}

},{}],25:[function(require,module,exports){
module.exports = merge;

/**
 * Augments `target` with properties in `options`. Does not override
 * target's properties if they are defined and matches expected type in 
 * options
 *
 * @returns {Object} merged object
 */
function merge(target, options) {
  var key;
  if (!target) { target = {}; }
  if (options) {
    for (key in options) {
      if (options.hasOwnProperty(key)) {
        var targetHasIt = target.hasOwnProperty(key),
            optionsValueType = typeof options[key],
            shouldReplace = !targetHasIt || (typeof target[key] !== optionsValueType);

        if (shouldReplace) {
          target[key] = options[key];
        } else if (optionsValueType === 'object') {
          // go deep, don't care about loops here, we are simple API!:
          target[key] = merge(target[key], options[key]);
        }
      }
    }
  }

  return target;
}

},{}],26:[function(require,module,exports){
module.exports=require(10)
},{"./lib/bounds":27,"./lib/createBody":28,"./lib/dragForce":29,"./lib/eulerIntegrator":30,"./lib/spring":31,"./lib/springForce":32,"ngraph.expose":33,"ngraph.merge":25,"ngraph.quadtreebh":35}],27:[function(require,module,exports){
module.exports=require(11)
},{"ngraph.random":39}],28:[function(require,module,exports){
module.exports=require(12)
},{"ngraph.physics.primitives":34}],29:[function(require,module,exports){
module.exports=require(13)
},{"ngraph.expose":33,"ngraph.merge":25}],30:[function(require,module,exports){
module.exports=require(14)
},{}],31:[function(require,module,exports){
module.exports=require(15)
},{}],32:[function(require,module,exports){
module.exports=require(16)
},{"ngraph.expose":33,"ngraph.merge":25,"ngraph.random":39}],33:[function(require,module,exports){
module.exports=require(17)
},{}],34:[function(require,module,exports){
module.exports=require(9)
},{}],35:[function(require,module,exports){
module.exports=require(18)
},{"./insertStack":36,"./isSamePosition":37,"./node":38,"ngraph.random":39}],36:[function(require,module,exports){
module.exports=require(19)
},{}],37:[function(require,module,exports){
module.exports=require(20)
},{}],38:[function(require,module,exports){
module.exports=require(21)
},{}],39:[function(require,module,exports){
module.exports=require(22)
},{}],40:[function(require,module,exports){
module.exports = svg;
svg.compile = require('./lib/compile');

var svgns = "http://www.w3.org/2000/svg";
var xlinkns = "http://www.w3.org/1999/xlink";

function svg(element) {
  var svgElement = element;

  if (typeof element === "string") {
    svgElement = window.document.createElementNS(svgns, element);
  } else if (element.simplesvg) {
    return element;
  }

  svgElement.simplesvg = true; // this is not good, since we are monkey patching svg
  svgElement.attr = attr;
  svgElement.append = append;

  return svgElement;

  function append(child) {
    svgElement.appendChild(svg(child));

    return child;
  }

  function attr(name, value) {
    if (arguments.length === 2) {
      if (value !== null) {
        svgElement.setAttributeNS(null, name, value);
      } else {
        svgElement.removeAttributeNS(null, name);
      }

      return svgElement;
    }

    return svgElement.getAttributeNS(null, name);
  }
}

},{"./lib/compile":41}],41:[function(require,module,exports){
var parser = new DOMParser();
var svg = require('../');

module.exports = compile;

function compile(svgText) {
  try {
    return svg(parser.parseFromString(
      '<g xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg">' +
      svgText + '</g>', "text/xml").documentElement);
  } catch (e) {
    throw e;
  }
}

},{"../":40}],42:[function(require,module,exports){
/**
 * This module unifies handling of mouse whee event accross different browsers
 *
 * See https://developer.mozilla.org/en-US/docs/Web/Reference/Events/wheel?redirectlocale=en-US&redirectslug=DOM%2FMozilla_event_reference%2Fwheel
 * for more details
 *
 * Usage:
 *  var addWheelListener = require('wheel');
 *  addWheelListener(domElement, function (e) {
 *    // mouse wheel event
 *  });
 */
module.exports = addWheelListener;

var prefix = "", _addEventListener, onwheel, support;

// detect event model
if ( window.addEventListener ) {
    _addEventListener = "addEventListener";
} else {
    _addEventListener = "attachEvent";
    prefix = "on";
}

// detect available wheel event
support = "onwheel" in document.createElement("div") ? "wheel" : // Modern browsers support "wheel"
          document.onmousewheel !== undefined ? "mousewheel" : // Webkit and IE support at least "mousewheel"
          "DOMMouseScroll"; // let's assume that remaining browsers are older Firefox

function addWheelListener( elem, callback, useCapture ) {
    _addWheelListener( elem, support, callback, useCapture );

    // handle MozMousePixelScroll in older Firefox
    if( support == "DOMMouseScroll" ) {
        _addWheelListener( elem, "MozMousePixelScroll", callback, useCapture );
    }
};

function _addWheelListener( elem, eventName, callback, useCapture ) {
  elem[ _addEventListener ]( prefix + eventName, support == "wheel" ? callback : function( originalEvent ) {
    !originalEvent && ( originalEvent = window.event );

    // create a normalized event object
    var event = {
      // keep a ref to the original event object
      originalEvent: originalEvent,
      target: originalEvent.target || originalEvent.srcElement,
      type: "wheel",
      deltaMode: originalEvent.type == "MozMousePixelScroll" ? 0 : 1,
      deltaX: 0,
      delatZ: 0,
      preventDefault: function() {
        originalEvent.preventDefault ?
            originalEvent.preventDefault() :
            originalEvent.returnValue = false;
      }
    };

    // calculate deltaY (and deltaX) according to the event
    if ( support == "mousewheel" ) {
      event.deltaY = - 1/40 * originalEvent.wheelDelta;
      // Webkit also support wheelDeltaX
      originalEvent.wheelDeltaX && ( event.deltaX = - 1/40 * originalEvent.wheelDeltaX );
    } else {
      event.deltaY = originalEvent.detail;
    }

    // it's time to fire the callback
    return callback( event );

  }, useCapture || false );
}

},{}]},{},[1])