import RBush from 'rbush';
import { intersectShape } from '../intersectShape.js';

/**
 * Resolve a property value: if it's a function, call it with (data, ctx).
 * Otherwise return as-is (literal).
 */
function resolve(prop, data, ctx) {
  return typeof prop === 'function' ? prop(data, ctx) : prop;
}

/**
 * CanvasEdgeCollection renders edges on an HTML Canvas positioned behind the SVG.
 * Drop-in replacement for EdgeCollection with the same public API.
 *
 * Performance strategy:
 * - Full canvas redraw each frame (negligible cost for 10K+ lines)
 * - Fast path: when all style props are literals and no per-edge state,
 *   draws in a single beginPath/stroke with zero per-frame allocation
 * - General path: style batching with pooled structures (no per-frame GC)
 * - During layout: O(N) scan with inline bounds check (skips spatial index)
 * - After layout: R-tree spatial index for O(log N + visible) queries
 * - Draw in screen space with fixed lineWidth for non-scaling stroke
 */
export default class CanvasEdgeCollection {
  constructor(options = {}) {
    // Property functions for flat style
    this._colorProp = options.color || '#999';
    this._widthProp = options.width || 1;
    this._opacityProp = options.opacity || 0.6;

    // Fast path: if all style props are literals (not functions), skip per-edge resolution
    this._allLiteralStyles = typeof this._colorProp !== 'function' &&
                              typeof this._widthProp !== 'function' &&
                              typeof this._opacityProp !== 'function';

    // Directed edges: draw arrowheads
    this._directed = options.directed || false;

    // Data extraction callback
    this._dataFn = options.data || null;

    // R-tree for viewport culling (used only when positions are stable)
    this._spatialIndex = new RBush();
    this._spatialValid = false;
    this._positionsDirty = true;

    // Edge storage
    this._edges = [];
    this._edgeMap = new Map();
    this._freeIndices = [];

    // Batch state
    this._batchDepth = 0;
    this._batchDirty = false;

    // Render state
    this._lastDrawContext = null;
    this._lastScale = -1;

    // Model-driven state: edgeId -> Map<string, boolean>
    this._state = new Map();
    this._stateVersion = 0;

    // Arrow marker sizing (screen pixels)
    this._arrowLength = options.arrowLength || 10;
    this._arrowWidth = options.arrowWidth || 5;

    // Graph binding
    this._graph = options.graph || null;
    this._nodeCollection = options.nodeCollection || null;
    this._graphChangeListener = null;

    // Cached direction vectors for arrow offset optimization
    this._cachedDirections = new Map();

    // Preallocated ctx object for property functions
    this._reusableCtx = { zoom: 1 };
    this._reusableCtxKeys = [];

    // Reusable batch structures (avoid per-frame allocation)
    this._batches = new Map();
    this._batchPool = [];

    // Canvas setup
    this._container = options.container || null;
    this._canvas = document.createElement('canvas');
    this._canvas.style.position = 'absolute';
    this._canvas.style.top = '0';
    this._canvas.style.left = '0';
    this._canvas.style.pointerEvents = 'none';
    this._ctx2d = this._canvas.getContext('2d');

    // Insert canvas before the SVG (first child of container)
    if (this._container) {
      // Ensure the container is a positioning context for the absolute canvas
      if (getComputedStyle(this._container).position === 'static') {
        this._container.style.position = 'relative';
      }
      this._container.insertBefore(this._canvas, this._container.firstChild);
    }

    // No SVG root — canvas is a sibling of the SVG, not a child of it
    this._root = null;

    // Canvas sizing state
    this._canvasWidth = 0;
    this._canvasHeight = 0;

    // ResizeObserver for container sizing
    this._resizeObserver = null;
    if (this._container && typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        this._resizeCanvas();
        if (this._lastDrawContext) {
          this.render(this._lastDrawContext);
        }
      });
      this._resizeObserver.observe(this._container);
    }

    if (this._graph) {
      this._bindGraph();
    }
  }

  /**
   * Get the root SVG group element (null — canvas is separate from SVG)
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
      _collection: this,
    };

    this._edges[index] = edge;
    this._edgeMap.set(id, edge);
    this._spatialValid = false;

    if (this._batchDepth > 0) {
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

    this._freeIndices.push(edge.index);
    this._edges[edge.index] = null;
    this._edgeMap.delete(edge.id);
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
      }
    }
    if (changed) this._stateVersion++;
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

          // Reuse existing direction object to avoid GC pressure
          let dir = this._cachedDirections.get(edge.id);
          if (dir) {
            dir.dirX = dirX;
            dir.dirY = dirY;
          } else {
            dir = { dirX, dirY };
            this._cachedDirections.set(edge.id, dir);
          }

          const toShape = nodeCol.getNodeShape(toId);
          const fromShape = nodeCol.getNodeShape(fromId);
          if (toShape) {
            const offset = intersectShape(dirX, dirY, toShape);
            edge.toX = toShape.x + offset.x;
            edge.toY = toShape.y + offset.y;
          } else {
            edge.toX = toPos.x;
            edge.toY = toPos.y;
          }
          if (fromShape) {
            const offset = intersectShape(-dirX, -dirY, fromShape);
            edge.fromX = fromShape.x + offset.x;
            edge.fromY = fromShape.y + offset.y;
          } else {
            edge.fromX = fromPos.x;
            edge.fromY = fromPos.y;
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

    // Resize canvas if needed
    if (drawContext.width !== this._canvasWidth || drawContext.height !== this._canvasHeight) {
      this._resizeCanvas();
    }

    if (scaleChanged && this._nodeCollection) {
      this._recomputeArrowOffsets();
    }

    if (this._positionsDirty) {
      this._positionsDirty = false;
      this._spatialValid = false;
      // During layout: O(N) scan, skip spatial index rebuild
      this._drawAllEdges(drawContext);
    } else {
      if (!this._spatialValid) {
        this._rebuildSpatialIndex();
        this._spatialValid = true;
      }
      // Pan/zoom only: use spatial index for viewport culling
      this._drawWithSpatialQuery(drawContext);
    }
  }

  _resizeCanvas() {
    const dc = this._lastDrawContext;
    let width, height;
    if (dc) {
      width = dc.width;
      height = dc.height;
    } else if (this._container) {
      const rect = this._container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    } else {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = width * dpr;
    this._canvas.height = height * dpr;
    this._canvas.style.width = width + 'px';
    this._canvas.style.height = height + 'px';
    this._canvasWidth = width;
    this._canvasHeight = height;
  }

  /**
   * Layout path: iterate all edges with inline bounds check.
   * Avoids rebuilding the spatial index every frame during layout.
   */
  _drawAllEdges(drawContext) {
    const ctx = this._ctx2d;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this._edgeMap.size === 0) return;

    const scale = drawContext.transform.scale;
    const tx = drawContext.transform.x;
    const ty = drawContext.transform.y;
    const bounds = drawContext.getVisibleBounds();
    const left = bounds.left, right = bounds.right;
    const top = bounds.top, bottom = bounds.bottom;
    const directed = this._directed;
    const edges = this._edges;

    // Fast path: all literal styles, no per-edge state — zero allocation
    if (this._allLiteralStyles && this._state.size === 0) {
      ctx.strokeStyle = this._colorProp;
      ctx.lineWidth = this._widthProp;
      ctx.globalAlpha = this._opacityProp;

      ctx.beginPath();
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        if (!edge) continue;
        const eMinX = edge.fromX < edge.toX ? edge.fromX : edge.toX;
        const eMaxX = edge.fromX > edge.toX ? edge.fromX : edge.toX;
        const eMinY = edge.fromY < edge.toY ? edge.fromY : edge.toY;
        const eMaxY = edge.fromY > edge.toY ? edge.fromY : edge.toY;
        if (eMaxX < left || eMinX > right || eMaxY < top || eMinY > bottom) continue;
        ctx.moveTo(edge.fromX * scale + tx, edge.fromY * scale + ty);
        ctx.lineTo(edge.toX * scale + tx, edge.toY * scale + ty);
      }
      ctx.stroke();

      if (directed) {
        ctx.fillStyle = this._colorProp;
        for (let i = 0; i < edges.length; i++) {
          const edge = edges[i];
          if (!edge) continue;
          const eMinX = edge.fromX < edge.toX ? edge.fromX : edge.toX;
          const eMaxX = edge.fromX > edge.toX ? edge.fromX : edge.toX;
          const eMinY = edge.fromY < edge.toY ? edge.fromY : edge.toY;
          const eMaxY = edge.fromY > edge.toY ? edge.fromY : edge.toY;
          if (eMaxX < left || eMinX > right || eMaxY < top || eMinY > bottom) continue;
          this._drawArrow(ctx,
            edge.fromX * scale + tx, edge.fromY * scale + ty,
            edge.toX * scale + tx, edge.toY * scale + ty, scale);
        }
      }

      ctx.globalAlpha = 1;
      return;
    }

    // General path: resolve per-edge styles, batch with pooled structures
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      if (!edge) continue;
      const eMinX = edge.fromX < edge.toX ? edge.fromX : edge.toX;
      const eMaxX = edge.fromX > edge.toX ? edge.fromX : edge.toX;
      const eMinY = edge.fromY < edge.toY ? edge.fromY : edge.toY;
      const eMaxY = edge.fromY > edge.toY ? edge.fromY : edge.toY;
      if (eMaxX < left || eMinX > right || eMaxY < top || eMinY > bottom) continue;
      this._addToBatch(edge);
    }
    this._drawBatches(ctx, scale, tx, ty, directed);
  }

  /**
   * Pan/zoom path: query spatial index for visible edges.
   */
  _drawWithSpatialQuery(drawContext) {
    const ctx = this._ctx2d;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this._edgeMap.size === 0) return;

    const scale = drawContext.transform.scale;
    const tx = drawContext.transform.x;
    const ty = drawContext.transform.y;
    const bounds = drawContext.getVisibleBounds();
    const directed = this._directed;

    const results = this._spatialIndex.search({
      minX: bounds.left,
      minY: bounds.top,
      maxX: bounds.right,
      maxY: bounds.bottom,
    });

    if (results.length === 0) return;

    // Fast path: all literal styles, no per-edge state — zero allocation
    if (this._allLiteralStyles && this._state.size === 0) {
      ctx.strokeStyle = this._colorProp;
      ctx.lineWidth = this._widthProp;
      ctx.globalAlpha = this._opacityProp;

      ctx.beginPath();
      for (let i = 0; i < results.length; i++) {
        const edge = results[i].edge;
        ctx.moveTo(edge.fromX * scale + tx, edge.fromY * scale + ty);
        ctx.lineTo(edge.toX * scale + tx, edge.toY * scale + ty);
      }
      ctx.stroke();

      if (directed) {
        ctx.fillStyle = this._colorProp;
        for (let i = 0; i < results.length; i++) {
          const edge = results[i].edge;
          this._drawArrow(ctx,
            edge.fromX * scale + tx, edge.fromY * scale + ty,
            edge.toX * scale + tx, edge.toY * scale + ty, scale);
        }
      }

      ctx.globalAlpha = 1;
      return;
    }

    // General path: resolve per-edge styles, batch with pooled structures
    for (let i = 0; i < results.length; i++) {
      this._addToBatch(results[i].edge);
    }
    this._drawBatches(ctx, scale, tx, ty, directed);
  }

  /**
   * Resolve edge style and add to the appropriate batch (pooled).
   */
  _addToBatch(edge) {
    const propCtx = this._buildCtx(edge.id);
    const color = resolve(this._colorProp, edge.data, propCtx);
    const width = resolve(this._widthProp, edge.data, propCtx);
    const opacity = resolve(this._opacityProp, edge.data, propCtx);

    const key = color + '|' + width + '|' + opacity;
    let batch = this._batches.get(key);
    if (!batch) {
      batch = this._batchPool.pop();
      if (batch) {
        batch.color = color;
        batch.width = width;
        batch.opacity = opacity;
        batch.count = 0;
      } else {
        batch = { color, width, opacity, edges: [], count: 0 };
      }
      this._batches.set(key, batch);
    }
    if (batch.count < batch.edges.length) {
      batch.edges[batch.count] = edge;
    } else {
      batch.edges.push(edge);
    }
    batch.count++;
  }

  /**
   * Draw all accumulated batches, then recycle batch objects back to pool.
   */
  _drawBatches(ctx, scale, tx, ty, directed) {
    for (const batch of this._batches.values()) {
      ctx.strokeStyle = batch.color;
      ctx.lineWidth = batch.width;
      ctx.globalAlpha = batch.opacity;

      ctx.beginPath();
      const edges = batch.edges;
      const count = batch.count;
      for (let i = 0; i < count; i++) {
        const edge = edges[i];
        ctx.moveTo(edge.fromX * scale + tx, edge.fromY * scale + ty);
        ctx.lineTo(edge.toX * scale + tx, edge.toY * scale + ty);
      }
      ctx.stroke();

      if (directed) {
        ctx.fillStyle = batch.color;
        for (let i = 0; i < count; i++) {
          const edge = edges[i];
          this._drawArrow(ctx,
            edge.fromX * scale + tx, edge.fromY * scale + ty,
            edge.toX * scale + tx, edge.toY * scale + ty, scale);
        }
      }
    }

    ctx.globalAlpha = 1;

    // Recycle batches back to pool (arrays keep their allocated capacity)
    for (const batch of this._batches.values()) {
      batch.count = 0;
      this._batchPool.push(batch);
    }
    this._batches.clear();
  }

  _drawArrow(ctx, sx1, sy1, sx2, sy2, scale) {
    const dx = sx2 - sx1;
    const dy = sy2 - sy1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const dirX = dx / len;
    const dirY = dy / len;

    // Perpendicular
    const perpX = -dirY;
    const perpY = dirX;

    // Scale arrows with zoom when zoomed out, cap at nominal size
    const s = Math.min(1, scale);
    const arrowLen = this._arrowLength * s;
    const halfW = this._arrowWidth / 2 * s;

    // Triangle tip at (sx2, sy2), base behind it
    const baseX = sx2 - dirX * arrowLen;
    const baseY = sy2 - dirY * arrowLen;

    ctx.beginPath();
    ctx.moveTo(sx2, sy2);
    ctx.lineTo(baseX + perpX * halfW, baseY + perpY * halfW);
    ctx.lineTo(baseX - perpX * halfW, baseY - perpY * halfW);
    ctx.closePath();
    ctx.fill();
  }

  // ── Spatial index ──────────────────────────────────────────────────

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

  _recomputeArrowOffsets() {
    const nodeCol = this._nodeCollection;
    if (!nodeCol) return;

    for (const edge of this._edges) {
      if (!edge) continue;
      const cached = this._cachedDirections.get(edge.id);
      if (!cached) continue;

      const toId = edge.data.toId;
      const fromId = edge.data.fromId;

      if (toId) {
        const shape = nodeCol.getNodeShape(toId);
        if (shape) {
          const offset = intersectShape(cached.dirX, cached.dirY, shape);
          edge.toX = shape.x + offset.x;
          edge.toY = shape.y + offset.y;
        }
      }
      if (fromId) {
        const shape = nodeCol.getNodeShape(fromId);
        if (shape) {
          const offset = intersectShape(-cached.dirX, -cached.dirY, shape);
          edge.fromX = shape.x + offset.x;
          edge.fromY = shape.y + offset.y;
        }
      }
    }
    this._positionsDirty = true;
    this._spatialValid = false;
  }

  // ── Clear / Dispose ────────────────────────────────────────────────

  clear() {
    this._edges.length = 0;
    this._freeIndices.length = 0;
    this._edgeMap.clear();
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

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    this.clear();

    // Release pooled batch structures
    this._batches.clear();
    this._batchPool.length = 0;

    if (this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────

  _generateId() {
    return `edge_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
