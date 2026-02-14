import RBush from 'rbush';
import DomOverlay from './DomOverlay.js';


const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Resolve a property value: if it's a function, call it with (data, ctx).
 * Otherwise return as-is (literal).
 */
function resolve(prop, data, ctx) {
  return typeof prop === 'function' ? prop(data, ctx) : prop;
}

/**
 * Escape HTML entities in a string for safe SVG text content.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Normalize a level definition. Supports shorthand (single shape)
 * and full form (layers array).
 *
 * Shorthand: { type: 'circle', radius: 2, fill: '#CFCCDF' }
 *   becomes: { minZoom: 0, layers: [{ type: 'circle', radius: 2, fill: '#CFCCDF' }] }
 */
function normalizeLevel(level) {
  let normalized;
  if (level.type && !level.layers) {
    // Shorthand: single layer
    const { minZoom, maxZoom, importance, hitArea, ...layerProps } = level;
    normalized = {
      minZoom: minZoom || 0,
      maxZoom: maxZoom,
      importance: importance,
      hitArea: hitArea,
      layers: [layerProps],
    };
  } else {
    normalized = {
      minZoom: level.minZoom || 0,
      maxZoom: level.maxZoom,
      importance: level.importance,
      hitArea: level.hitArea,
      layers: level.layers || [],
    };
  }
  // Detect DOM layers
  const domLayer = normalized.layers.find(l => l.type === 'dom');
  if (domLayer) {
    normalized._domLayer = domLayer;
  }
  // Detect SVG layers with update callback
  const svgLayer = normalized.layers.find(l => l.type === 'svg' && l.update);
  if (svgLayer) {
    normalized._svgUpdate = svgLayer.update;
  }
  return normalized;
}

/**
 * Render a single layer to an SVG string.
 */
function renderLayer(layer, data, ctx) {
  // Check conditional visibility
  if (layer.visible !== undefined && !resolve(layer.visible, data, ctx)) {
    return '';
  }

  const type = layer.type;

  if (type === 'circle') {
    const r = resolve(layer.radius, data, ctx) || 4;
    const fill = resolve(layer.fill, data, ctx) || 'none';
    const stroke = resolve(layer.stroke, data, ctx) || 'none';
    const strokeWidth = resolve(layer.strokeWidth, data, ctx) || 0;
    const opacity = resolve(layer.opacity, data, ctx);
    const filter = resolve(layer.filter, data, ctx);

    let attrs = `r="${r}" fill="${fill}"`;
    if (stroke !== 'none') attrs += ` stroke="${stroke}"`;
    if (strokeWidth) attrs += ` stroke-width="${strokeWidth}"`;
    if (opacity !== undefined && opacity !== null) attrs += ` opacity="${opacity}"`;
    if (filter) attrs += ` filter="${filter}"`;
    return `<circle ${attrs}/>`;
  }

  if (type === 'rect') {
    const w = resolve(layer.width, data, ctx) || 10;
    const h = resolve(layer.height, data, ctx) || 10;
    const rx = resolve(layer.rx, data, ctx);
    const ry = resolve(layer.ry, data, ctx);
    const fill = resolve(layer.fill, data, ctx) || 'none';
    const stroke = resolve(layer.stroke, data, ctx) || 'none';
    const strokeWidth = resolve(layer.strokeWidth, data, ctx) || 0;
    const opacity = resolve(layer.opacity, data, ctx);
    const filter = resolve(layer.filter, data, ctx);

    let attrs = `x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${fill}"`;
    if (rx !== undefined && rx !== null) attrs += ` rx="${rx}"`;
    if (ry !== undefined && ry !== null) attrs += ` ry="${ry}"`;
    if (stroke !== 'none') attrs += ` stroke="${stroke}"`;
    if (strokeWidth) attrs += ` stroke-width="${strokeWidth}"`;
    if (opacity !== undefined && opacity !== null) attrs += ` opacity="${opacity}"`;
    if (filter) attrs += ` filter="${filter}"`;
    return `<rect ${attrs}/>`;
  }

  if (type === 'text') {
    const text = resolve(layer.text, data, ctx);
    if (text === undefined || text === null || text === '') return '';

    const fontSize = resolve(layer.fontSize, data, ctx) || 10;
    const fill = resolve(layer.fill, data, ctx) || '#000';
    const fontFamily = resolve(layer.fontFamily, data, ctx);
    const fontWeight = resolve(layer.fontWeight, data, ctx);
    const anchor = resolve(layer.anchor, data, ctx) || 'center';
    const offset = resolve(layer.offset, data, ctx) || [0, 0];
    const opacity = resolve(layer.opacity, data, ctx);
    const maxWidth = resolve(layer.maxWidth, data, ctx);

    // Compute text-anchor and position based on anchor setting
    let textAnchor = 'middle';
    let dx = offset[0];
    let dy = offset[1];

    // For 'center', dominant-baseline centering
    if (anchor === 'center') {
      dy += fontSize * 0.35; // approximate vertical centering
    }
    // For top/bottom/left/right, position is already handled via offset

    let attrs = `x="${dx}" y="${dy}" text-anchor="${textAnchor}" font-size="${fontSize}" fill="${fill}"`;
    if (fontFamily) attrs += ` font-family="${fontFamily}"`;
    if (fontWeight) attrs += ` font-weight="${fontWeight}"`;
    if (opacity !== undefined && opacity !== null) attrs += ` opacity="${opacity}"`;

    const str = String(text);

    // Word-wrap when maxWidth is specified and text is wider
    if (maxWidth && str.length * fontSize * 0.6 > maxWidth) {
      const lines = wrapText(str, fontSize, maxWidth);
      const lineHeight = fontSize * 1.3;
      let tspans = '';
      for (let i = 0; i < lines.length; i++) {
        if (i === 0) {
          tspans += `<tspan x="${dx}">${escapeHtml(lines[i])}</tspan>`;
        } else {
          tspans += `<tspan x="${dx}" dy="${lineHeight}">${escapeHtml(lines[i])}</tspan>`;
        }
      }
      return `<text ${attrs}>${tspans}</text>`;
    }

    return `<text ${attrs}>${escapeHtml(str)}</text>`;
  }

  if (type === 'svg') {
    if (typeof layer.create === 'function') {
      return layer.create(data, ctx) || '';
    }
    return '';
  }

  // DOM layers are handled by DomOverlay, not SVG rendering
  if (type === 'dom') return '';

  return '';
}

/**
 * Word-wrap text into lines that fit within maxWidth.
 */
function wrapText(text, fontSize, maxWidth) {
  const charWidth = fontSize * 0.6;
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (testLine.length > maxChars && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Render all layers for a level into an SVG string.
 */
function renderLevelLayers(normalizedLevel, data, ctx) {
  const layers = normalizedLevel.layers;
  if (!layers || layers.length === 0) return '';

  let svg = '';
  for (let i = 0; i < layers.length; i++) {
    svg += renderLayer(layers[i], data, ctx);
  }
  return svg;
}

/**
 * Compute the bounding box for collision detection from a level's layers.
 * Returns { width, height } in screen pixels.
 */
function computeLevelBounds(normalizedLevel, data, ctx) {
  const layers = normalizedLevel.layers;
  let maxW = 0;
  let maxH = 0;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (layer.visible !== undefined && !resolve(layer.visible, data, ctx)) continue;

    const type = layer.type;
    if (type === 'circle') {
      const r = resolve(layer.radius, data, ctx) || 4;
      const d = r * 2;
      if (d > maxW) maxW = d;
      if (d > maxH) maxH = d;
    } else if (type === 'rect') {
      const w = resolve(layer.width, data, ctx) || 10;
      const h = resolve(layer.height, data, ctx) || 10;
      if (w > maxW) maxW = w;
      if (h > maxH) maxH = h;
    } else if (type === 'svg') {
      const w = resolve(layer.width, data, ctx);
      const h = resolve(layer.height, data, ctx);
      if (w && w > maxW) maxW = w;
      if (h && h > maxH) maxH = h;
    } else if (type === 'dom') {
      const w = resolve(layer.width, data, ctx) || 0;
      const h = resolve(layer.height, data, ctx) || 0;
      if (w > maxW) maxW = w;
      if (h > maxH) maxH = h;
    } else if (type === 'text') {
      const text = resolve(layer.text, data, ctx);
      if (!text) continue;
      const fontSize = resolve(layer.fontSize, data, ctx) || 10;
      const offset = resolve(layer.offset, data, ctx) || [0, 0];
      const mw = resolve(layer.maxWidth, data, ctx);
      const str = String(text);
      let tw, th;
      if (mw && str.length * fontSize * 0.6 > mw) {
        const lines = wrapText(str, fontSize, mw);
        tw = mw + Math.abs(offset[0]) * 2;
        th = lines.length * fontSize * 1.3 + Math.abs(offset[1]);
      } else {
        tw = str.length * fontSize * 0.6 + Math.abs(offset[0]) * 2;
        th = fontSize + Math.abs(offset[1]);
      }
      if (tw > maxW) maxW = tw;
      // Accumulate height for text layers
      maxH += th;
    }
  }

  // If hitArea is specified on the level, use that instead
  if (normalizedLevel.hitArea) {
    const ha = normalizedLevel.hitArea;
    if (ha.type === 'rect') {
      maxW = resolve(ha.width, data, ctx) || maxW;
      maxH = resolve(ha.height, data, ctx) || maxH;
    }
  }

  return { width: maxW, height: maxH };
}

/**
 * Get the shape descriptor for a level (for arrow intersection).
 * Returns the first circle or rect layer's shape, or null.
 */
function getLevelShape(normalizedLevel, data, ctx) {
  const layers = normalizedLevel.layers;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (layer.type === 'circle') {
      return {
        type: 'circle',
        radius: resolve(layer.radius, data, ctx) || 4,
      };
    }
    if (layer.type === 'rect') {
      return {
        type: 'rect',
        width: resolve(layer.width, data, ctx) || 10,
        height: resolve(layer.height, data, ctx) || 10,
      };
    }
  }
  return null;
}


/**
 * NodeCollection manages batched node rendering with the MapLibre-inspired styling API.
 *
 * Key concepts:
 * - `data` callback extracts data from graph nodes
 * - `levels` define zoom-dependent rendering with collision-based importance
 * - Property functions: literal, `d => val`, `(d, ctx) => val`
 * - `ctx` object contains state flags (highlighted, dimmed, etc.) and zoom
 *
 * Performance strategy:
 * - During layout (positions changing): O(N) visibility scan, DOM detach for off-screen nodes
 * - After layout (pan/zoom only): R-tree spatial index for O(log N + visible) queries
 * - Elements are detached from DOM (not just hidden) when off-screen
 */
export default class NodeCollection {
  constructor(options = {}) {
    // Data extraction callback: (graphNode) => data object
    this._dataFn = options.data || null;

    // Maximum scale for node content (counter-scaling cap)
    this._maxScale = options.maxScale ?? 1;

    // Levels: zoom-dependent rendering with collision-based importance
    this._levels = (options.levels || []).map(normalizeLevel);

    // R-tree for level collision detection (lazy init per level)
    this._collisionTrees = new Map(); // levelIndex -> RBush

    // R-tree for viewport culling
    this._spatialIndex = new RBush();
    this._spatialValid = false;
    this._positionsDirty = true;

    // Track which nodes are currently attached to the DOM
    this._attachedNodes = new Set();
    this._swapAttachedSet = new Set();
    this._maxNodeSize = 0;

    // Create root group
    this._root = document.createElementNS(SVG_NS, 'g');
    this._root.setAttribute('class', 'node-collection');

    // Node storage
    this._nodes = [];
    this._nodeMap = new Map(); // id -> node
    this._freeIndices = [];

    // Batch update state
    this._batchDepth = 0;
    this._batchDirty = false;

    // SVG element pool for recycling
    this._elementPool = [];

    // Render state
    this._lastDrawContext = null;
    this._lastScale = 1;
    this._lastCollisionZoom = 0;
    this._lastCandidateLevel = undefined;

    // Model-driven state: nodeId -> Map<string, boolean>
    this._state = new Map();

    // Per-node resolved level index (after collision): nodeId -> levelIndex
    this._resolvedLevels = new Map();
    this._prevResolvedLevels = new Map();

    // Transition state: nodeId -> { fromLevel, toLevel, startTime }
    this._transitions = new Map();
    this._transitionDuration = 150; // ms

    // Preallocated ctx object for property functions
    this._reusableCtx = { zoom: 1 };
    this._reusableCtxKeys = [];

    // Collision detection throttle: only recompute every N ms during layout
    // (positions change every frame, but collision results are stable for longer)
    this._collisionInterval = options.collisionInterval ?? 200; // ms
    this._lastCollisionTime = 0;

    // Preallocated arrays for collision detection (avoid GC pressure)
    this._collisionNodes = [];    // reused each _computeResolvedLevels call
    this._collisionCandidates = []; // reused per level
    this._collisionStable = [];     // reused per level (preserveExisting mode)

    // DOM overlay for `type: 'dom'` layers
    this._hasDomLayers = this._levels.some(l => l._domLayer);
    this._domOverlay = null; // lazy init on first render

    // Graph binding
    this._graph = options.graph || null;
    this._graphChangeListener = null;

    if (this._graph && this._dataFn) {
      this._bindGraph();
    }
  }

  /**
   * Get the root SVG group element
   */
  getRoot() {
    return this._root;
  }

  /**
   * Add a node to the collection
   * @returns {Object} Node handle
   */
  add(options) {
    const {
      id = this._generateId(),
      x = 0,
      y = 0,
      data = {},
    } = options;

    const size = this._computeNodeSize(data);

    let index;
    if (this._freeIndices.length > 0) {
      index = this._freeIndices.pop();
    } else {
      index = this._nodes.length;
    }

    const node = {
      id,
      index,
      x,
      y,
      size,
      data,
      visible: true,
      _element: null,
      _currentLevel: -1,
      _inDOM: false,
      _collection: this,
      _stateVersion: 0,
      _renderedLevel: -1,
      _renderedStateVersion: -1,
    };

    this._nodes[index] = node;
    this._nodeMap.set(id, node);

    if (size > this._maxNodeSize) this._maxNodeSize = size;

    this._createNodeElement(node);
    this._spatialValid = false;

    if (this._batchDepth === 0) {
      this._addNodeToScene(node, this._lastDrawContext);
    } else {
      this._batchDirty = true;
    }

    return node;
  }

  /**
   * Remove a node from the collection
   */
  remove(nodeOrId) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this._nodeMap.get(nodeOrId);
    if (!node) return;

    if (node._element) {
      if (node._inDOM) {
        this._root.removeChild(node._element);
        node._inDOM = false;
      }
      this._elementPool.push(node._element);
      node._element = null;
    }

    if (this._domOverlay) this._domOverlay.remove(node.id);

    this._freeIndices.push(node.index);
    this._nodes[node.index] = null;
    this._nodeMap.delete(node.id);
    this._attachedNodes.delete(node);
    this._state.delete(node.id);
    this._resolvedLevels.delete(node.id);
    this._prevResolvedLevels.delete(node.id);
    this._transitions.delete(node.id);
    this._spatialValid = false;

    if (this._batchDepth > 0) {
      this._batchDirty = true;
    }
  }

  /**
   * Get a node by ID
   */
  get(id) {
    return this._nodeMap.get(id);
  }

  /**
   * Set node position (GC-friendly)
   */
  setPosition(node, x, y) {
    node.x = x;
    node.y = y;
    this._positionsDirty = true;
    if (this._batchDepth === 0 && node._element && node._inDOM) {
      this._applyTransform(node);
    }
  }

  /**
   * Apply transform to a node element
   */
  _applyTransform(node) {
    if (!node._element) return;
    const contentScale = Math.min(1, this._maxScale / this._lastScale);
    if (contentScale !== 1) {
      node._element.setAttribute('transform',
        `translate(${node.x}, ${node.y}) scale(${contentScale})`);
    } else {
      node._element.setAttribute('transform', `translate(${node.x}, ${node.y})`);
    }
  }

  // ── Model-driven state ──────────────────────────────────────────────

  /**
   * Set a state key on a node. State keys are available in ctx for property functions.
   * Also applied as CSS classes for external styling.
   */
  setState(nodeOrId, key, value) {
    const id = typeof nodeOrId === 'object' ? nodeOrId.id : nodeOrId;
    let stateMap = this._state.get(id);
    if (value) {
      if (!stateMap) {
        stateMap = new Map();
        this._state.set(id, stateMap);
      }
      stateMap.set(key, true);
    } else {
      if (stateMap) {
        stateMap.delete(key);
        if (stateMap.size === 0) this._state.delete(id);
      }
    }

    const node = this._nodeMap.get(id);
    if (node) {
      node._stateVersion++;
      if (node._element) {
        if (value) {
          node._element.classList.add(key);
        } else {
          node._element.classList.remove(key);
        }
      }
    }
  }

  /**
   * Get a state value for a node
   */
  getState(nodeOrId, key) {
    const id = typeof nodeOrId === 'object' ? nodeOrId.id : nodeOrId;
    const stateMap = this._state.get(id);
    return stateMap ? (stateMap.get(key) || false) : false;
  }

  /**
   * Force re-render of all nodes on the next frame.
   * Useful when external data used by property callbacks (e.g. fontSize)
   * has changed without any level or state change.
   */
  invalidateContent() {
    for (const node of this._nodeMap.values()) {
      node._stateVersion++;
    }
  }

  /**
   * Remove a state key from ALL nodes and sync CSS classes
   */
  clearState(key) {
    for (const [id, stateMap] of this._state) {
      if (stateMap.has(key)) {
        stateMap.delete(key);
        if (stateMap.size === 0) this._state.delete(id);

        const node = this._nodeMap.get(id);
        if (node) {
          node._stateVersion++;
          if (node._element) {
            node._element.classList.remove(key);
          }
        }
      }
    }
  }

  /**
   * Reapply all state keys as CSS classes on a node element.
   */
  _reapplyState(node) {
    if (!node._element) return;
    node._element.setAttribute('class', 'node');
    const stateMap = this._state.get(node.id);
    if (stateMap) {
      for (const key of stateMap.keys()) {
        node._element.classList.add(key);
      }
    }
  }

  /**
   * Build ctx object for a node's property functions.
   */
  _buildCtx(nodeId) {
    const ctx = this._reusableCtx;
    const prevKeys = this._reusableCtxKeys;
    for (let i = 0; i < prevKeys.length; i++) {
      ctx[prevKeys[i]] = undefined;
    }
    prevKeys.length = 0;
    ctx.zoom = this._lastScale;
    const stateMap = this._state.get(nodeId);
    if (stateMap) {
      for (const [key, value] of stateMap) {
        ctx[key] = value;
        prevKeys.push(key);
      }
    }
    return ctx;
  }

  // ── Shape descriptors ───────────────────────────────────────────────

  /**
   * Get the current shape of a node in world coordinates.
   */
  getNodeShape(nodeId) {
    const node = this._nodeMap.get(nodeId);
    if (!node) return null;

    const resolvedLevel = this._resolvedLevels.get(nodeId) ?? 0;
    if (resolvedLevel < 0 || resolvedLevel >= this._levels.length) return null;

    const level = this._levels[resolvedLevel];
    const ctx = this._buildCtx(nodeId);
    const shape = getLevelShape(level, node.data, ctx);
    if (!shape) return null;

    const contentScale = Math.min(1, this._maxScale / this._lastScale);

    if (shape.type === 'circle') {
      return {
        type: 'circle',
        radius: shape.radius * contentScale,
        x: node.x,
        y: node.y,
      };
    }

    if (shape.type === 'rect') {
      return {
        type: 'rect',
        width: shape.width * contentScale,
        height: shape.height * contentScale,
        x: node.x,
        y: node.y,
      };
    }

    return null;
  }

  /**
   * Get the current content scale factor.
   */
  getContentScale() {
    return Math.min(1, this._maxScale / this._lastScale);
  }

  // ── Sync positions ─────────────────────────────────────────────────

  syncPositions(positions) {
    this.beginBatch();
    // Update positions for nodes in the map and show them;
    // hide nodes not in the map (e.g. hidden by layered layout).
    for (const [id, pos] of positions) {
      const node = this._nodeMap.get(id);
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
        if (!node.visible) node.visible = true;
      }
    }
    for (let i = 0; i < this._nodes.length; i++) {
      const node = this._nodes[i];
      if (node && node.visible && !positions.has(node.id)) {
        node.visible = false;
      }
    }
    this._positionsDirty = true;
    this.endBatch();
  }

  // ── Hit testing ────────────────────────────────────────────────────

  getNodeAt(screenX, screenY, drawContext) {
    if (!drawContext) drawContext = this._lastDrawContext;
    if (!drawContext) return null;

    const scene = drawContext.screenToScene(screenX, screenY);
    const searchRadius = Math.max(this._maxNodeSize, 80 / this._lastScale);

    if (!this._spatialValid) {
      this._rebuildSpatialIndex();
      this._spatialValid = true;
    }

    const results = this._spatialIndex.search({
      minX: scene.x - searchRadius,
      minY: scene.y - searchRadius,
      maxX: scene.x + searchRadius,
      maxY: scene.y + searchRadius,
    });

    let closest = null;
    let closestDist = Infinity;
    const contentScale = Math.min(1, this._maxScale / this._lastScale);
    const minWorldRadius = 10 / this._lastScale;

    for (let i = 0; i < results.length; i++) {
      const node = results[i].node;
      const dx = scene.x - node.x;
      const dy = scene.y - node.y;
      const dist = dx * dx + dy * dy;

      let hit = false;

      // Use level bounds for hit testing (includes text labels)
      if (this._levels.length > 0) {
        const resolvedLevel = this._resolvedLevels.get(node.id) ?? 0;
        if (resolvedLevel >= 0 && resolvedLevel < this._levels.length) {
          const level = this._levels[resolvedLevel];
          const ctx = this._buildCtx(node.id);
          const bounds = computeLevelBounds(level, node.data, ctx);
          const hw = Math.max(bounds.width * contentScale / 2, minWorldRadius);
          const hh = Math.max(bounds.height * contentScale / 2, minWorldRadius);

          hit = Math.abs(dx) <= hw && Math.abs(dy) <= hh;
        }
      }

      // Fallback: use node shape or default radius
      if (!hit) {
        const shape = this.getNodeShape(node.id);
        if (shape && shape.type === 'circle') {
          const hitRadius = Math.max(shape.radius, minWorldRadius);
          hit = dist <= hitRadius * hitRadius;
        } else if (shape && shape.type === 'rect') {
          const hw = Math.max(shape.width / 2, minWorldRadius);
          const hh = Math.max(shape.height / 2, minWorldRadius);
          hit = Math.abs(dx) <= hw && Math.abs(dy) <= hh;
        } else {
          const hitRadius = Math.max(minWorldRadius, node.size * 0.5);
          hit = dist <= hitRadius * hitRadius;
        }
      }

      if (hit && dist < closestDist) {
        closestDist = dist;
        closest = node;
      }
    }

    return closest ? closest.id : null;
  }

  // ── Batch updates ──────────────────────────────────────────────────

  beginBatch() {
    this._batchDepth++;
  }

  endBatch() {
    if (this._batchDepth > 0) this._batchDepth--;
    if (this._batchDepth === 0 && this._batchDirty) {
      this._batchDirty = false;
      this.render(this._lastDrawContext);
    }
  }

  // ── Iteration ──────────────────────────────────────────────────────

  forEach(callback) {
    for (let i = 0; i < this._nodes.length; i++) {
      const node = this._nodes[i];
      if (node) callback(node, node.id);
    }
  }

  get count() {
    return this._nodeMap.size;
  }

  // ── Render ─────────────────────────────────────────────────────────

  render(drawContext) {
    this._lastDrawContext = drawContext;
    if (!drawContext) return;

    const newScale = drawContext.transform.scale;
    const scaleChanged = newScale !== this._lastScale;
    this._lastScale = newScale;

    // Recompute collisions when:
    // 1. Zoom crossed a level boundary (new levels became eligible)
    // 2. Zoom changed by >20% from last collision computation
    // 3. Positions changed (throttled during layout)
    // Avoid recomputing on every zoom tick — the greedy collision algorithm
    // produces cascade effects where small screen-position changes cause
    // nodes to gain/lose levels in chain reactions.
    const now = performance.now();
    const newCandidateLevel = this._getCandidateLevelIndex(newScale);
    const levelBoundaryCrossed = this._lastCandidateLevel !== undefined &&
      newCandidateLevel !== this._lastCandidateLevel;
    this._lastCandidateLevel = newCandidateLevel;

    const zoomRatio = this._lastCollisionZoom > 0 ? newScale / this._lastCollisionZoom : Infinity;
    const zoomIn = zoomRatio > 1.2;
    const zoomOut = zoomRatio < 0.83;

    if (levelBoundaryCrossed || zoomOut ||
        (this._positionsDirty && now - this._lastCollisionTime >= this._collisionInterval)) {
      // Fresh recompute: level boundary, zoom-out, or position changes
      this._computeResolvedLevels(drawContext, false);
      this._lastCollisionTime = now;
      this._lastCollisionZoom = newScale;
    } else if (zoomIn) {
      // Accumulative: preserve existing assignments, only add new promotions
      this._computeResolvedLevels(drawContext, true);
      this._lastCollisionTime = now;
      this._lastCollisionZoom = newScale;
    }

    // Lazy-init DOM overlay on first render
    if (this._hasDomLayers && !this._domOverlay) {
      const svg = this._root.ownerSVGElement;
      if (svg) this._domOverlay = new DomOverlay(svg);
    }
    if (this._domOverlay) {
      this._domOverlay.syncTransform(drawContext);
    }

    if (this._positionsDirty) {
      this._positionsDirty = false;
      this._spatialValid = false;
      this._renderAllNodes(drawContext, scaleChanged);
    } else {
      if (!this._spatialValid) {
        this._rebuildSpatialIndex();
        this._spatialValid = true;
      }
      this._renderWithSpatialQuery(drawContext, scaleChanged);
    }
  }

  /**
   * Compute which level each node should render at, considering zoom and collision.
   *
   * For each node:
   * 1. Find the candidate level based on zoom (last level where minZoom <= zoom)
   * 2. If level has importance, check collision with more important nodes
   * 3. On collision, fall back to previous level
   */
  _computeResolvedLevels(drawContext, preserveExisting = false) {
    const zoom = this._lastScale;
    const levels = this._levels;
    if (levels.length === 0) return;

    // Swap resolved levels for change detection
    const temp = this._prevResolvedLevels;
    this._prevResolvedLevels = this._resolvedLevels;
    this._resolvedLevels = temp;
    this._resolvedLevels.clear();

    const candidateLevel = this._getCandidateLevelIndex(zoom);

    // Collect visible nodes into pooled array (no allocation after warmup)
    const collisionNodes = this._collisionNodes;
    collisionNodes.length = 0;
    for (let i = 0; i < this._nodes.length; i++) {
      const node = this._nodes[i];
      if (!node || !node.visible) continue;
      const visibilityRadius = Math.max(node.size, 50 / zoom);
      if (!drawContext.isVisible(node.x, node.y, visibilityRadius)) continue;
      collisionNodes.push(node);
    }

    const contentScale = Math.min(1, this._maxScale / zoom);
    const candidates = this._collisionCandidates;
    const stableList = this._collisionStable;

    // Pre-compute screen center for centerProximity (available in ctx for importance functions)
    const screenCenterX = drawContext.width / 2;
    const screenCenterY = drawContext.height / 2;
    const maxCenterDist = Math.hypot(screenCenterX, screenCenterY) || 1;

    // Reusable bbox object — only used transiently for tree.collides() checks.
    // tree.insert() copies the values internally, so reuse is safe for collides().
    // For insert(), we still allocate since RBush stores the reference.
    const testBbox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    for (let li = candidateLevel; li >= 0; li--) {
      const level = levels[li];

      if (zoom < level.minZoom) continue;
      if (level.maxZoom !== undefined && zoom >= level.maxZoom) continue;

      if (!level.importance) {
        for (let i = 0; i < collisionNodes.length; i++) {
          const node = collisionNodes[i];
          if (!this._resolvedLevels.has(node.id)) {
            this._resolvedLevels.set(node.id, li);
          }
        }
        break;
      }

      // Importance-gated level: collision detection
      let tree = this._collisionTrees.get(li);
      if (!tree) {
        tree = new RBush();
        this._collisionTrees.set(li, tree);
      } else {
        tree.clear();
      }

      // In preserveExisting mode (zoom-in), re-insert nodes that were at this
      // level previously, sorted by importance. This prevents cascade effects
      // where newly-promoted nodes displace existing ones. Collision is still
      // checked among stable nodes to handle zoom-dependent bound changes
      // (e.g. `visible` thresholds on layers).
      if (preserveExisting) {
        stableList.length = 0;
        for (let i = 0; i < collisionNodes.length; i++) {
          const node = collisionNodes[i];
          if (this._resolvedLevels.has(node.id)) continue;
          if (this._prevResolvedLevels.get(node.id) !== li) continue;
          const ctx = this._buildCtx(node.id);
          const sp = drawContext.sceneToScreen(node.x, node.y);
          ctx.centerProximity = 1 - Math.min(1, Math.hypot(sp.x - screenCenterX, sp.y - screenCenterY) / maxCenterDist);
          const importance = resolve(level.importance, node.data, ctx);
          stableList.push(node, importance || 0);
        }
        // Sort pairs [node, importance, node, importance, ...] by importance desc
        this._sortPairs(stableList);

        for (let i = 0; i < stableList.length; i += 2) {
          const node = stableList[i];
          this._fillBbox(testBbox, node, level, contentScale, zoom, drawContext);
          if (!tree.collides(testBbox)) {
            tree.insert({ minX: testBbox.minX, minY: testBbox.minY,
                          maxX: testBbox.maxX, maxY: testBbox.maxY });
            this._resolvedLevels.set(node.id, li);
          }
        }
      }

      // Process remaining unresolved nodes by importance
      candidates.length = 0;
      for (let i = 0; i < collisionNodes.length; i++) {
        const node = collisionNodes[i];
        if (this._resolvedLevels.has(node.id)) continue;
        const ctx = this._buildCtx(node.id);
        const sp = drawContext.sceneToScreen(node.x, node.y);
        ctx.centerProximity = 1 - Math.min(1, Math.hypot(sp.x - screenCenterX, sp.y - screenCenterY) / maxCenterDist);
        const importance = resolve(level.importance, node.data, ctx);
        candidates.push(node, importance || 0);
      }
      this._sortPairs(candidates);

      for (let i = 0; i < candidates.length; i += 2) {
        const node = candidates[i];
        this._fillBbox(testBbox, node, level, contentScale, zoom, drawContext);
        if (!tree.collides(testBbox)) {
          tree.insert({ minX: testBbox.minX, minY: testBbox.minY,
                        maxX: testBbox.maxX, maxY: testBbox.maxY });
          this._resolvedLevels.set(node.id, li);
        }
      }
    }

    // Any remaining unresolved nodes get level 0
    for (let i = 0; i < collisionNodes.length; i++) {
      const node = collisionNodes[i];
      if (!this._resolvedLevels.has(node.id)) {
        this._resolvedLevels.set(node.id, 0);
      }
    }

  }

  /**
   * Find the highest candidate level index for the current zoom.
   */
  _getCandidateLevelIndex(zoom) {
    const levels = this._levels;
    let candidate = 0;
    for (let i = 0; i < levels.length; i++) {
      if (zoom >= levels[i].minZoom) {
        if (levels[i].maxZoom === undefined || zoom < levels[i].maxZoom) {
          candidate = i;
        }
      }
    }
    return candidate;
  }

  /**
   * O(N) render path — used during layout when positions change every frame.
   */
  _renderAllNodes(drawContext, scaleChanged) {
    this._attachedNodes.clear();

    for (let i = 0; i < this._nodes.length; i++) {
      const node = this._nodes[i];
      if (!node || !node._element) continue;

      const visibilityRadius = Math.max(node.size, 50 / this._lastScale);
      const visible = node.visible && drawContext.isVisible(node.x, node.y, visibilityRadius);

      if (visible) {
        if (!node._inDOM) {
          this._root.appendChild(node._element);
          node._inDOM = true;
          this._reapplyState(node);
        }
        this._applyTransform(node);
        this._updateNodeContent(node, drawContext, scaleChanged);
        this._attachedNodes.add(node);
      } else {
        if (node._inDOM) {
          this._root.removeChild(node._element);
          node._inDOM = false;
        }
        if (this._domOverlay) this._domOverlay.detach(node.id);
      }
    }
  }

  /**
   * R-tree render path — used during pan/zoom when positions are stable.
   */
  _renderWithSpatialQuery(drawContext, scaleChanged) {
    const bounds = drawContext.getVisibleBounds();
    const margin = Math.max(this._maxNodeSize, 100 / this._lastScale);

    const results = this._spatialIndex.search({
      minX: bounds.left - margin,
      minY: bounds.top - margin,
      maxX: bounds.right + margin,
      maxY: bounds.bottom + margin,
    });

    const newAttached = this._swapAttachedSet;
    newAttached.clear();

    for (let i = 0; i < results.length; i++) {
      const node = results[i].node;
      if (!node._element) continue;

      const visibilityRadius = Math.max(node.size, 50 / this._lastScale);
      if (!drawContext.isVisible(node.x, node.y, visibilityRadius)) continue;

      if (!node._inDOM) {
        this._root.appendChild(node._element);
        node._inDOM = true;
        this._reapplyState(node);
        this._applyTransform(node);
      }
      this._updateNodeContent(node, drawContext, scaleChanged);
      newAttached.add(node);
    }

    for (const node of this._attachedNodes) {
      if (!newAttached.has(node)) {
        if (node._inDOM) {
          this._root.removeChild(node._element);
          node._inDOM = false;
        }
        if (this._domOverlay) this._domOverlay.detach(node.id);
      }
    }

    this._swapAttachedSet = this._attachedNodes;
    this._attachedNodes = newAttached;
  }

  _rebuildSpatialIndex() {
    const items = [];
    for (const node of this._nodes) {
      if (!node || !node.visible) continue;
      items.push({
        minX: node.x,
        minY: node.y,
        maxX: node.x,
        maxY: node.y,
        node,
      });
    }
    this._spatialIndex.clear();
    if (items.length > 0) {
      this._spatialIndex.load(items);
    }
  }

  _addNodeToScene(node, drawContext) {
    if (!node._element || !drawContext) return;

    const visibilityRadius = Math.max(node.size, 50 / this._lastScale);
    const visible = drawContext.isVisible(node.x, node.y, visibilityRadius);

    if (visible) {
      if (!node._inDOM) {
        this._root.appendChild(node._element);
        node._inDOM = true;
        this._reapplyState(node);
        this._attachedNodes.add(node);
      }
      this._updateNodeContent(node, drawContext);
    }
  }

  /**
   * Update node content based on resolved level.
   */
  _updateNodeContent(node, drawContext, scaleChanged = false) {
    if (!node._element || !drawContext) return;

    if (scaleChanged) {
      this._applyTransform(node);
    }

    if (this._levels.length === 0) return;

    const resolvedLevel = this._resolvedLevels.get(node.id) ?? 0;

    if (node._currentLevel !== resolvedLevel) {
      // Level changed — start transition if node was previously rendered
      if (node._currentLevel >= 0) {
        this._transitions.set(node.id, {
          fromLevel: node._currentLevel,
          toLevel: resolvedLevel,
          startTime: performance.now(),
        });
      }
      node._currentLevel = resolvedLevel;
    }

    // Handle DOM overlay lifecycle
    if (this._domOverlay) {
      this._syncDomLayer(node);
    }

    // Skip re-render if level and state haven't changed and no transition is active
    if (!this._transitions.has(node.id) &&
        node._currentLevel === node._renderedLevel &&
        node._stateVersion === node._renderedStateVersion) {
      return;
    }

    this._renderNode(node);
    node._renderedLevel = node._currentLevel;
    node._renderedStateVersion = node._stateVersion;
  }

  /**
   * Sync DOM overlay element for a node: create/attach/detach/update as needed.
   * Uses world coordinates + contentScale to match SVG node scaling behavior.
   */
  _syncDomLayer(node) {
    const level = this._levels[node._currentLevel];
    const domLayer = level?._domLayer;

    if (domLayer) {
      const data = node.data;
      const ctx = this._buildCtx(node.id);
      const overlay = this._domOverlay;

      // Ensure element exists (create only once)
      overlay.ensureElement(node.id, data, ctx, domLayer.create);

      // Position in world coords with same counter-scale as SVG nodes.
      // Offset by half the declared width/height so the element centers
      // on (node.x, node.y), matching SVG node centering.
      const contentScale = Math.min(1, this._maxScale / this._lastScale);
      const halfW = resolve(domLayer.width, data, ctx) / 2 || 0;
      const halfH = resolve(domLayer.height, data, ctx) / 2 || 0;
      overlay.setPosition(node.id, node.x, node.y, contentScale, halfW, halfH);
      overlay.attach(node.id);

      // Update state if changed
      if (domLayer.update) {
        overlay.updateState(node.id, data, ctx, domLayer.update, node._stateVersion);
      }
    } else {
      // Not at a DOM level — detach if attached
      this._domOverlay.detach(node.id);
    }
  }

  /**
   * Render a node at its current resolved level.
   */
  _renderNode(node) {
    const levels = this._levels;
    const levelIndex = node._currentLevel;
    if (levelIndex < 0 || levelIndex >= levels.length) return;

    const level = levels[levelIndex];
    const ctx = this._buildCtx(node.id);

    // Check for active transition
    const transition = this._transitions.get(node.id);
    if (transition) {
      const elapsed = performance.now() - transition.startTime;
      const t = Math.min(1, elapsed / this._transitionDuration);

      if (t >= 1) {
        // Transition complete
        this._transitions.delete(node.id);
        // Render final level
        const svg = renderLevelLayers(level, node.data, ctx);
        node._element.innerHTML = `<g>${svg}</g>`;
      } else {
        // Cross-fade: render both levels
        const fromLevel = levels[transition.fromLevel];
        const toLevel = levels[transition.toLevel];
        const fromSvg = fromLevel ? renderLevelLayers(fromLevel, node.data, ctx) : '';
        const toSvg = toLevel ? renderLevelLayers(toLevel, node.data, ctx) : '';
        node._element.innerHTML =
          `<g opacity="${1 - t}">${fromSvg}</g>` +
          `<g opacity="${t}">${toSvg}</g>`;

        // Request another frame for the transition
        if (this._lastDrawContext) {
          // Schedule re-render via requestAnimationFrame
          this._scheduleTransitionFrame();
        }
        return;
      }
    } else if (node._renderedLevel === levelIndex && level._svgUpdate) {
      // Same level, state-only change: use SVG update callback
      level._svgUpdate(node.data, ctx, node._element);
    } else {
      const svg = renderLevelLayers(level, node.data, ctx);
      node._element.innerHTML = `<g>${svg}</g>`;
    }
  }

  _transitionRafId = null;

  _scheduleTransitionFrame() {
    if (this._transitionRafId) return;
    this._transitionRafId = requestAnimationFrame(() => {
      this._transitionRafId = null;
      if (this._transitions.size > 0) {
        // Re-render nodes with active transitions
        for (const [nodeId] of this._transitions) {
          const node = this._nodeMap.get(nodeId);
          if (node && node._inDOM) {
            this._renderNode(node);
          }
        }
      }
    });
  }

  /**
   * Fill a reusable bbox object with screen-space collision bounds for a node.
   */
  _fillBbox(bbox, node, level, contentScale, zoom, drawContext) {
    const ctx = this._buildCtx(node.id);
    const bounds = computeLevelBounds(level, node.data, ctx);
    const screenPos = drawContext.sceneToScreen(node.x, node.y);
    const hw = (bounds.width * contentScale * zoom) / 2;
    const hh = (bounds.height * contentScale * zoom) / 2;
    bbox.minX = screenPos.x - hw;
    bbox.minY = screenPos.y - hh;
    bbox.maxX = screenPos.x + hw;
    bbox.maxY = screenPos.y + hh;
  }

  /**
   * Sort a flat [node, importance, node, importance, ...] array by importance
   * descending. Avoids allocating {node, importance} wrapper objects.
   */
  _sortPairs(arr) {
    const len = arr.length >> 1;
    if (len <= 1) return;
    // For small arrays, insertion sort on pairs (avoids temp array allocation)
    for (let i = 1; i < len; i++) {
      const node = arr[i * 2];
      const imp = arr[i * 2 + 1];
      let j = i - 1;
      while (j >= 0 && arr[j * 2 + 1] < imp) {
        arr[(j + 1) * 2] = arr[j * 2];
        arr[(j + 1) * 2 + 1] = arr[j * 2 + 1];
        j--;
      }
      arr[(j + 1) * 2] = node;
      arr[(j + 1) * 2 + 1] = imp;
    }
  }

  // ── Clear / Dispose ────────────────────────────────────────────────

  clear() {
    for (let i = 0; i < this._nodes.length; i++) {
      const node = this._nodes[i];
      if (node) this.remove(node);
    }
    this._nodes.length = 0;
    this._freeIndices.length = 0;
    this._nodeMap.clear();
    this._attachedNodes.clear();
    this._swapAttachedSet.clear();
    this._spatialIndex.clear();
    this._spatialValid = false;
    this._maxNodeSize = 0;
    this._state.clear();
    this._resolvedLevels.clear();
    this._prevResolvedLevels.clear();
    this._transitions.clear();
    this._collisionTrees.clear();
    this._lastCollisionZoom = 0;
    this._lastCandidateLevel = undefined;
  }

  dispose() {
    if (this._graph && this._graphChangeListener) {
      this._graph.off('changed', this._graphChangeListener);
      this._graphChangeListener = null;
    }
    if (this._transitionRafId) {
      cancelAnimationFrame(this._transitionRafId);
      this._transitionRafId = null;
    }
    this.clear();
    this._elementPool.length = 0;
    if (this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    if (this._domOverlay) {
      this._domOverlay.dispose();
      this._domOverlay = null;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────

  _generateId() {
    return `node_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  _computeNodeSize(data) {
    const levels = this._levels;
    if (levels.length === 0) return 10;

    let maxSize = 0;
    const ctx = { zoom: 1 };
    for (let i = 0; i < levels.length; i++) {
      const bounds = computeLevelBounds(levels[i], data, ctx);
      const s = Math.max(bounds.width, bounds.height);
      if (s > maxSize) maxSize = s;
    }
    return maxSize || 10;
  }

  _createNodeElement(node) {
    let element = this._elementPool.pop();
    if (!element) {
      element = document.createElementNS(SVG_NS, 'g');
    }
    element.setAttribute('class', 'node');
    element.innerHTML = '';
    node._element = element;
  }

  // ── Graph binding ─────────────────────────────────────────────────

  _bindGraph() {
    const graph = this._graph;

    this.beginBatch();
    graph.forEachNode((graphNode) => {
      const data = this._dataFn(graphNode);
      this.add({
        id: graphNode.id,
        data,
      });
    });
    this.endBatch();

    this._graphChangeListener = (changes) => {
      this.beginBatch();
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        if (change.node) {
          if (change.changeType === 'add') {
            if (!this._nodeMap.has(change.node.id)) {
              const data = this._dataFn(change.node);
              this.add({
                id: change.node.id,
                data,
              });
            }
          } else if (change.changeType === 'remove') {
            this.remove(change.node.id);
          }
        }
      }
      this.endBatch();
    };
    graph.on('changed', this._graphChangeListener);
  }
}
