import RBush from 'rbush';
import { intersectShape } from '../intersectShape.js';


const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Resolve a property value: if it's a function, call it with (data, ctx).
 * Otherwise return as-is (literal).
 */
function resolve(prop, data, ctx) {
  return typeof prop === 'function' ? prop(data, ctx) : prop;
}

/**
 * EdgeCollection manages batched edge/line rendering with the MapLibre-inspired API.
 *
 * Supports two modes:
 * - Flat style: color, width, opacity as property functions
 * - Levels: zoom-dependent rendering (same pattern as NodeCollection)
 *
 * Performance strategy:
 * - During layout (positions changing): O(N) visibility scan, DOM detach for off-screen edges
 * - After layout (pan/zoom only): R-tree spatial index for O(log N + visible) queries
 */
export default class EdgeCollection {
  constructor(options = {}) {
    // Property functions for flat style: literal, d => val, or (d, ctx) => val
    this._colorProp = options.color || '#999';
    this._widthProp = options.width || 1;
    this._opacityProp = options.opacity || 0.6;

    // Directed edges: add arrowhead markers
    this._directed = options.directed || false;

    // Data extraction callback: (graphLink) => data object
    this._dataFn = options.data || null;

    // R-tree for viewport culling
    this._spatialIndex = new RBush();
    this._spatialValid = false;
    this._positionsDirty = true;

    // Track which edges are currently attached to the DOM
    this._attachedEdges = new Set();
    this._swapAttachedSet = new Set();

    // Create root group
    this._root = document.createElementNS(SVG_NS, 'g');
    this._root.setAttribute('class', 'edge-collection');

    // Edge storage
    this._edges = [];
    this._edgeMap = new Map();
    this._freeIndices = [];

    // Batch state
    this._batchDepth = 0;
    this._batchDirty = false;

    // Element pool
    this._elementPool = [];

    // Render state
    this._lastDrawContext = null;
    this._lastScale = -1;

    // Model-driven state: edgeId -> Map<string, boolean>
    this._state = new Map();
    this._stateVersion = 0;

    // Arrow marker sizing (screen pixels)
    this._arrowLength = options.arrowLength || 10;
    this._arrowWidth = options.arrowWidth || 5;
    this._markerElement = null;
    this._markerId = null;
    this._defs = null;

    // Graph binding
    this._graph = options.graph || null;
    this._nodeCollection = options.nodeCollection || null;
    this._graphChangeListener = null;

    // Cached direction vectors for arrow offset optimization
    this._cachedDirections = new Map();

    // Preallocated ctx object for property functions
    this._reusableCtx = { zoom: 1 };
    this._reusableCtxKeys = [];

    if (this._graph) {
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
   * Add an edge to the collection
   */
  add(options) {
    const {
      id = this._generateId(),
      fromX = 0,
      fromY = 0,
      toX = 0,
      toY = 0,
      data = {},
    } = options;

    let index;
    if (this._freeIndices.length > 0) {
      index = this._freeIndices.pop();
    } else {
      index = this._edges.length;
    }

    const edge = {
      id,
      index,
      fromX,
      fromY,
      toX,
      toY,
      data,
      visible: true,
      _element: null,
      _inDOM: false,
      _collection: this,
    };

    this._edges[index] = edge;
    this._edgeMap.set(id, edge);

    this._createEdgeElement(edge);
    this._spatialValid = false;

    if (this._batchDepth === 0) {
      this._addEdgeToScene(edge, this._lastDrawContext);
    } else {
      this._batchDirty = true;
    }

    return edge;
  }

  /**
   * Remove an edge from the collection
   */
  remove(edgeOrId) {
    const edge = typeof edgeOrId === 'object' ? edgeOrId : this._edgeMap.get(edgeOrId);
    if (!edge) return;

    if (edge._element) {
      if (edge._inDOM) {
        this._root.removeChild(edge._element);
        edge._inDOM = false;
      }
      this._elementPool.push(edge._element);
      edge._element = null;
    }

    this._freeIndices.push(edge.index);
    this._edges[edge.index] = null;
    this._edgeMap.delete(edge.id);
    this._attachedEdges.delete(edge);
    this._state.delete(edge.id);
    this._cachedDirections.delete(edge.id);
    this._spatialValid = false;

    if (this._batchDepth > 0) {
      this._batchDirty = true;
    }
  }

  /**
   * Get an edge by ID
   */
  get(id) {
    return this._edgeMap.get(id);
  }

  /**
   * Set edge endpoints (GC-friendly)
   */
  setEndpoints(edge, fromX, fromY, toX, toY) {
    edge.fromX = fromX;
    edge.fromY = fromY;
    edge.toX = toX;
    edge.toY = toY;
    this._positionsDirty = true;

    if (this._batchDepth === 0 && edge._element && edge._inDOM) {
      this._updateEdgeGeometry(edge);
    }
  }

  // ── Model-driven state ──────────────────────────────────────────────

  setState(edgeOrId, key, value) {
    const id = typeof edgeOrId === 'object' ? edgeOrId.id : edgeOrId;
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
    this._stateVersion++;

    const edge = this._edgeMap.get(id);
    if (edge && edge._element) {
      if (value) {
        edge._element.classList.add(key);
      } else {
        edge._element.classList.remove(key);
      }
    }
  }

  getState(edgeOrId, key) {
    const id = typeof edgeOrId === 'object' ? edgeOrId.id : edgeOrId;
    const stateMap = this._state.get(id);
    return stateMap ? (stateMap.get(key) || false) : false;
  }

  clearState(key) {
    let changed = false;
    for (const [id, stateMap] of this._state) {
      if (stateMap.has(key)) {
        stateMap.delete(key);
        if (stateMap.size === 0) this._state.delete(id);
        changed = true;

        const edge = this._edgeMap.get(id);
        if (edge && edge._element) {
          edge._element.classList.remove(key);
        }
      }
    }
    if (changed) this._stateVersion++;
  }

  _reapplyState(edge) {
    if (!edge._element) return;
    edge._element.setAttribute('class', 'edge');
    const stateMap = this._state.get(edge.id);
    if (stateMap) {
      for (const key of stateMap.keys()) {
        edge._element.classList.add(key);
      }
    }
  }

  /**
   * Build ctx object for property functions.
   */
  _buildCtx(edgeId) {
    const ctx = this._reusableCtx;
    const prevKeys = this._reusableCtxKeys;
    for (let i = 0; i < prevKeys.length; i++) {
      ctx[prevKeys[i]] = undefined;
    }
    prevKeys.length = 0;
    ctx.zoom = this._lastScale;
    const stateMap = this._state.get(edgeId);
    if (stateMap) {
      for (const [key, value] of stateMap) {
        ctx[key] = value;
        prevKeys.push(key);
      }
    }
    return ctx;
  }

  // ── Sync positions ─────────────────────────────────────────────────

  syncPositions(positions) {
    if (!this._graph) return;

    const nodeCol = this._nodeCollection;
    const directed = this._directed && nodeCol;

    this.beginBatch();
    for (const edge of this._edges) {
      if (!edge) continue;

      const fromId = edge.data.fromId;
      const toId = edge.data.toId;
      if (!fromId || !toId) continue;

      const fromPos = positions.get(fromId);
      const toPos = positions.get(toId);
      if (!fromPos || !toPos) continue;

      if (directed) {
        const dx = fromPos.x - toPos.x;
        const dy = fromPos.y - toPos.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len > 0.001) {
          const dirX = dx / len;
          const dirY = dy / len;

          this._cachedDirections.set(edge.id, { dirX, dirY });

          const shape = nodeCol.getNodeShape(toId);
          if (shape) {
            const offset = intersectShape(dirX, dirY, shape);
            edge.fromX = fromPos.x;
            edge.fromY = fromPos.y;
            edge.toX = shape.x + offset.x;
            edge.toY = shape.y + offset.y;
          } else {
            edge.fromX = fromPos.x;
            edge.fromY = fromPos.y;
            edge.toX = toPos.x;
            edge.toY = toPos.y;
          }
        } else {
          edge.fromX = fromPos.x;
          edge.fromY = fromPos.y;
          edge.toX = toPos.x;
          edge.toY = toPos.y;
        }
      } else {
        edge.fromX = fromPos.x;
        edge.fromY = fromPos.y;
        edge.toX = toPos.x;
        edge.toY = toPos.y;
      }
    }
    this._positionsDirty = true;
    this.endBatch();
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
    for (let i = 0; i < this._edges.length; i++) {
      const edge = this._edges[i];
      if (edge) callback(edge, edge.id);
    }
  }

  get count() {
    return this._edgeMap.size;
  }

  // ── Render ─────────────────────────────────────────────────────────

  render(drawContext) {
    this._lastDrawContext = drawContext;
    if (!drawContext) return;

    const newScale = drawContext.transform.scale;
    const scaleChanged = this._directed && newScale !== this._lastScale;
    this._lastScale = newScale;

    if (scaleChanged) {
      if (this._nodeCollection) {
        this._recomputeArrowOffsets();
      }
    }

    if (this._positionsDirty) {
      this._positionsDirty = false;
      this._spatialValid = false;
      this._renderAllEdges(drawContext);
    } else {
      if (!this._spatialValid) {
        this._rebuildSpatialIndex();
        this._spatialValid = true;
      }
      this._renderWithSpatialQuery(drawContext);
    }
  }

  _renderAllEdges(drawContext) {
    this._attachedEdges.clear();
    const bounds = drawContext.getVisibleBounds();

    for (let i = 0; i < this._edges.length; i++) {
      const edge = this._edges[i];
      if (!edge || !edge._element) continue;

      const visible = this._isEdgeVisibleInBounds(edge, bounds);

      if (visible) {
        if (!edge._inDOM) {
          this._root.appendChild(edge._element);
          edge._inDOM = true;
          this._reapplyState(edge);
        }
        this._updateEdgeGeometry(edge);
        this._updateEdgeStyle(edge);
        this._attachedEdges.add(edge);
      } else if (edge._inDOM) {
        this._root.removeChild(edge._element);
        edge._inDOM = false;
      }
    }
  }

  _renderWithSpatialQuery(drawContext) {
    const bounds = drawContext.getVisibleBounds();

    const results = this._spatialIndex.search({
      minX: bounds.left,
      minY: bounds.top,
      maxX: bounds.right,
      maxY: bounds.bottom,
    });

    const newAttached = this._swapAttachedSet;
    newAttached.clear();

    for (let i = 0; i < results.length; i++) {
      const edge = results[i].edge;
      if (!edge._element) continue;

      if (!edge._inDOM) {
        this._root.appendChild(edge._element);
        edge._inDOM = true;
        this._reapplyState(edge);
        this._updateEdgeGeometry(edge);
      }
      this._updateEdgeStyle(edge);
      newAttached.add(edge);
    }

    for (const edge of this._attachedEdges) {
      if (!newAttached.has(edge) && edge._inDOM) {
        this._root.removeChild(edge._element);
        edge._inDOM = false;
      }
    }

    this._swapAttachedSet = this._attachedEdges;
    this._attachedEdges = newAttached;
  }

  _rebuildSpatialIndex() {
    const items = [];
    for (const edge of this._edges) {
      if (!edge) continue;
      items.push({
        minX: Math.min(edge.fromX, edge.toX),
        minY: Math.min(edge.fromY, edge.toY),
        maxX: Math.max(edge.fromX, edge.toX),
        maxY: Math.max(edge.fromY, edge.toY),
        edge,
      });
    }
    this._spatialIndex.clear();
    if (items.length > 0) {
      this._spatialIndex.load(items);
    }
  }

  _addEdgeToScene(edge, drawContext) {
    if (!edge._element || !drawContext) return;

    const bounds = drawContext.getVisibleBounds();
    const visible = this._isEdgeVisibleInBounds(edge, bounds);

    if (visible) {
      if (!edge._inDOM) {
        this._root.appendChild(edge._element);
        edge._inDOM = true;
        this._reapplyState(edge);
        this._attachedEdges.add(edge);
      }
      this._updateEdgeGeometry(edge);
      this._updateEdgeStyle(edge);
    }
  }

  _recomputeArrowOffsets() {
    const nodeCol = this._nodeCollection;
    if (!nodeCol) return;

    for (const edge of this._edges) {
      if (!edge) continue;
      const cached = this._cachedDirections.get(edge.id);
      if (!cached) continue;

      const toId = edge.data.toId;
      if (!toId) continue;

      const shape = nodeCol.getNodeShape(toId);
      if (!shape) continue;

      const offset = intersectShape(cached.dirX, cached.dirY, shape);
      edge.toX = shape.x + offset.x;
      edge.toY = shape.y + offset.y;
    }
    this._positionsDirty = true;
    this._spatialValid = false;
  }

  // Marker dimensions are constant (not zoom-dependent) because edges use
  // vector-effect: non-scaling-stroke, which causes the browser to render
  // markers at constant screen size without applying the zoom transform.

  // ── Clear / Dispose ────────────────────────────────────────────────

  clear() {
    for (let i = 0; i < this._edges.length; i++) {
      const edge = this._edges[i];
      if (edge) this.remove(edge);
    }
    this._edges.length = 0;
    this._freeIndices.length = 0;
    this._edgeMap.clear();
    this._attachedEdges.clear();
    this._swapAttachedSet.clear();
    this._spatialIndex.clear();
    this._spatialValid = false;
    this._state.clear();
    this._cachedDirections.clear();
  }

  dispose() {
    if (this._graph && this._graphChangeListener) {
      this._graph.off('changed', this._graphChangeListener);
      this._graphChangeListener = null;
    }
    this.clear();
    this._elementPool.length = 0;
    this._markerId = null;
    if (this._defs && this._defs.parentNode) {
      this._defs.parentNode.removeChild(this._defs);
      this._defs = null;
    }
    if (this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────

  _generateId() {
    return `edge_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  _createEdgeElement(edge) {
    let element = this._elementPool.pop();

    if (!element) {
      element = document.createElementNS(SVG_NS, 'path');
    }

    element.setAttribute('class', 'edge');
    element.setAttribute('vector-effect', 'non-scaling-stroke');

    edge._element = element;

    // Apply initial style
    this._updateEdgeStyle(edge);

    if (this._directed) {
      this._applyArrowMarker(edge);
    }
  }

  _updateEdgeGeometry(edge) {
    edge._element.setAttribute('d',
      `M${edge.fromX} ${edge.fromY}L${edge.toX} ${edge.toY}`
    );
  }

  /**
   * Update edge style using property functions.
   * Resolves color, width, opacity with (data, ctx).
   */
  _updateEdgeStyle(edge) {
    if (edge._renderedStateVersion === this._stateVersion &&
        edge._renderedZoom === this._lastScale) {
      return;
    }

    const ctx = this._buildCtx(edge.id);
    const color = resolve(this._colorProp, edge.data, ctx);
    const width = resolve(this._widthProp, edge.data, ctx);
    const opacity = resolve(this._opacityProp, edge.data, ctx);

    edge._element.setAttribute('stroke', color);
    edge._element.setAttribute('stroke-width', width);
    edge._element.setAttribute('opacity', opacity);

    edge._renderedStateVersion = this._stateVersion;
    edge._renderedZoom = this._lastScale;
  }

  // ── Arrow marker management ─────────────────────────────────────────

  _ensureDefs() {
    if (this._defs) return this._defs;

    let svgEl = this._root.parentNode;
    while (svgEl && svgEl.nodeName !== 'svg') {
      svgEl = svgEl.parentNode;
    }

    if (!svgEl) {
      svgEl = this._root;
    }

    this._defs = svgEl.querySelector('defs');
    if (!this._defs) {
      this._defs = document.createElementNS(SVG_NS, 'defs');
      svgEl.insertBefore(this._defs, svgEl.firstChild);
    }

    return this._defs;
  }

  _applyArrowMarker(edge) {
    if (!this._markerId) {
      this._createSharedMarker();
    }
    edge._element.setAttribute('marker-end', `url(#${this._markerId})`);
  }

  _createSharedMarker() {
    const id = 'ngraph-arrow';
    this._markerId = id;
    const defs = this._ensureDefs();

    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('markerWidth', this._arrowLength);
    marker.setAttribute('markerHeight', this._arrowWidth);
    marker.setAttribute('preserveAspectRatio', 'none');
    marker.setAttribute('orient', 'auto');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill', 'context-stroke');

    marker.appendChild(path);
    defs.appendChild(marker);
    this._markerElement = marker;
  }

  _isEdgeVisibleInBounds(edge, bounds) {
    const minX = Math.min(edge.fromX, edge.toX);
    const maxX = Math.max(edge.fromX, edge.toX);
    const minY = Math.min(edge.fromY, edge.toY);
    const maxY = Math.max(edge.fromY, edge.toY);

    return !(maxX < bounds.left || minX > bounds.right ||
             maxY < bounds.top || minY > bounds.bottom);
  }

  // ── Graph binding ─────────────────────────────────────────────────

  _bindGraph() {
    const graph = this._graph;

    this.beginBatch();
    graph.forEachLink((link) => {
      const data = this._dataFn
        ? { fromId: link.fromId, toId: link.toId, ...this._dataFn(link) }
        : { fromId: link.fromId, toId: link.toId };

      this.add({
        id: link.id,
        data,
      });
    });
    this.endBatch();

    this._graphChangeListener = (changes) => {
      this.beginBatch();
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        if (change.link) {
          if (change.changeType === 'add') {
            if (!this._edgeMap.has(change.link.id)) {
              const data = this._dataFn
                ? { fromId: change.link.fromId, toId: change.link.toId, ...this._dataFn(change.link) }
                : { fromId: change.link.fromId, toId: change.link.toId };

              this.add({
                id: change.link.id,
                data,
              });
            }
          } else if (change.changeType === 'remove') {
            this.remove(change.link.id);
          }
        }
      }
      this.endBatch();
    };
    graph.on('changed', this._graphChangeListener);
  }
}
