# ngraph.svg

SVG-based graph visualization library with adaptive rendering. Designed for rendering large graphs with zoom-dependent detail levels, collision-based importance, and viewport culling.

## Features

- **Adaptive rendering** — nodes show different detail levels based on zoom (dots → labels → cards)
- **Collision-based importance** — more important nodes get richer detail at lower zoom levels
- **Property functions** — style any property with a literal, `d => val`, or `(d, ctx) => val`
- **Performance** — element pooling, viewport culling via R-tree, batched DOM updates
- **Force-directed layout** — integrated with ngraph.forcelayout, with layered orchestration and stress refinement
- **Interactive controls** — pan, zoom, kinetic scrolling on mouse and touch
- **Directed edges** — arrow markers with automatic endpoint calculation on node boundaries

## Installation

```bash
npm install ngraph.svg
```

## Quick Start

```js
import createGraph from 'ngraph.graph';
import {
  createScene, NodeCollection, EdgeCollection, ForceLayoutAdapter
} from 'ngraph.svg';

// 1. Create a graph
const graph = createGraph();
graph.addNode('a', { label: 'Node A' });
graph.addNode('b', { label: 'Node B' });
graph.addLink('a', 'b');

// 2. Create the scene
const scene = createScene(document.getElementById('container'), {
  panZoom: { minZoom: 0.1, maxZoom: 50 }
});

// 3. Create collections (graph binding auto-syncs nodes/edges)
const nodeCol = new NodeCollection({
  graph,
  data: (graphNode) => ({
    label: graphNode.data?.label || graphNode.id,
  }),
  maxScale: 2,
  levels: [
    { type: 'circle', radius: 2, fill: '#4a90d9' },
    { minZoom: 2,
      layers: [
        { type: 'circle', radius: 4, fill: '#4a90d9' },
        { type: 'text', text: d => d.label, fontSize: 10, fill: '#fff',
          anchor: 'top', offset: [0, -8] },
      ] },
  ],
});

const edgeCol = new EdgeCollection({
  graph,
  nodeCollection: nodeCol,
  directed: true,
  color: '#666',
  width: 1,
  opacity: 0.5,
});

scene.addCollection(edgeCol);
scene.addCollection(nodeCol);

// 4. Layout
const layout = new ForceLayoutAdapter(graph, { springLength: 50 });
layout.onUpdate((positions) => {
  nodeCol.syncPositions(positions);
  edgeCol.syncPositions(positions);
  scene.requestRender();
});
layout.start();
```

## API Reference

### createScene(container, options)

Creates an SVG scene for graph visualization.

**Parameters:**
- `container` — DOM element to attach the scene to
- `options.viewBox` — initial bounds `{ left, top, right, bottom }` (default: -100 to 100)
- `options.panZoom` — pan/zoom config `{ minZoom, maxZoom, enabled }` (default: 0.1–20)

**Returns:** Scene object with properties and methods:
- `svg` — the SVG root element
- `root` — the transform group containing all scene content
- `drawContext` — current DrawContext
- `addCollection(collection)` / `removeCollection(collection)` — manage collections
- `on(event, callback)` / `off(event, callback)` — events: `render`, `transform`, `resize`
- `requestRender()` — request render on next animation frame
- `getPanZoom()` — get the pan/zoom controller
- `flyTo(x, y, scale, duration)` — animated camera movement (returns Promise)
- `fitToView(bounds, padding)` — fit content to viewport
- `dispose()` — clean up resources

### NodeCollection

Manages batched node rendering with a MapLibre-inspired styling API.

```js
const nodes = new NodeCollection({
  graph,                            // ngraph instance (auto-binds nodes)
  data: (graphNode) => ({...}),     // extract data from graph node
  maxScale: 2,                      // counter-scaling cap

  levels: [
    // Level 0: always visible, no importance gating
    { type: 'circle', radius: 2, fill: '#CFCCDF' },

    // Level 1: importance-gated, any zoom
    { importance: d => d.importance,
      layers: [
        { type: 'circle', radius: 3, fill: '#CFCCDF' },
        { type: 'text', text: d => d.name, fontSize: 10, fill: '#CFCCDF',
          anchor: 'top', offset: [0, -8] },
      ] },

    // Level 2: importance-gated, zoom >= 3.5
    { minZoom: 3.5, importance: d => d.importance,
      layers: [
        { type: 'circle', radius: 4, fill: '#CFCCDF' },
        { type: 'text', text: d => d.name, fontSize: 11, fill: '#CFCCDF',
          anchor: 'top', offset: [0, -10] },
        { type: 'text', text: d => d.version, fontSize: 9, fill: '#888',
          anchor: 'bottom', offset: [0, 16], visible: d => !!d.version },
      ] },
  ],
});
```

**Methods:**
- `add({ id, x, y, data })` — add a node, returns node handle
- `remove(nodeOrId)` — remove a node
- `get(id)` — get node by ID
- `setPosition(node, x, y)` — update position
- `syncPositions(positions)` — sync positions from a `Map<id, {x, y}>`
- `getNodeAt(screenX, screenY, drawContext)` — hit testing (returns node ID or null)
- `getNodeShape(nodeId)` — get current shape in world coordinates (for arrow intersection)
- `setState(nodeOrId, key, value)` — set state (affects `ctx` in property functions + CSS class)
- `getState(nodeOrId, key)` — get state value
- `clearState(key)` — remove a state key from all nodes
- `beginBatch()` / `endBatch()` — batch DOM updates
- `forEach(callback)` — iterate nodes
- `count` — number of nodes (getter)
- `clear()` — remove all nodes
- `dispose()` — clean up resources

### EdgeCollection

Manages batched edge/line rendering.

```js
const edges = new EdgeCollection({
  graph,                            // ngraph instance (auto-binds edges)
  nodeCollection: nodeCol,          // for directed arrow endpoint calculation
  directed: true,                   // add arrowhead markers
  color: '#666',                    // literal, d => val, or (d, ctx) => val
  width: 1,
  opacity: 0.5,
  arrowLength: 10,                  // screen pixels
  arrowWidth: 5,                    // screen pixels
});
```

**Methods:**
- `add({ id, fromX, fromY, toX, toY, data })` — add an edge, returns edge handle
- `remove(edgeOrId)` — remove an edge
- `get(id)` — get edge by ID
- `setEndpoints(edge, fromX, fromY, toX, toY)` — update geometry
- `syncPositions(positions)` — sync endpoints from a `Map<id, {x, y}>` (handles directed arrow offsets)
- `setState(edgeOrId, key, value)` — set state
- `getState(edgeOrId, key)` — get state
- `clearState(key)` — clear state from all edges
- `beginBatch()` / `endBatch()` — batch DOM updates
- `forEach(callback)` — iterate edges
- `count` — number of edges (getter)
- `clear()` — remove all edges
- `dispose()` — clean up resources

### CanvasEdgeCollection

Canvas-based drop-in replacement for `EdgeCollection`. Renders edges on an HTML Canvas positioned behind the SVG, which is significantly faster on mobile for large edge counts (10K+).

```js
import { CanvasEdgeCollection } from 'ngraph.svg';

const edges = new CanvasEdgeCollection({
  container,                        // DOM element (same one passed to createScene)
  graph,                            // ngraph instance (auto-binds edges)
  nodeCollection: nodeCol,          // for directed arrow endpoint calculation
  directed: true,                   // draw arrowheads on canvas
  color: '#666',                    // literal, d => val, or (d, ctx) => val
  width: 1,
  opacity: 0.5,
  arrowLength: 10,                  // screen pixels
  arrowWidth: 5,                    // screen pixels
});
```

**Differences from EdgeCollection:**
- Requires a `container` option (the same DOM element passed to `createScene`)
- Renders to a `<canvas>` element behind the SVG instead of SVG `<path>` elements
- No per-edge DOM elements — style changes don't add CSS classes
- `getRoot()` returns `null` (no SVG group needed)
- Same public API otherwise: `add`, `remove`, `get`, `setEndpoints`, `syncPositions`, `setState`, `clearState`, `beginBatch`/`endBatch`, `forEach`, `count`, `clear`, `dispose`

**Performance strategy:**
- Full canvas redraw each frame (negligible cost for 10K+ lines)
- Style batching: groups edges by (color, width, opacity) tuple
- Draws in screen space with fixed lineWidth for non-scaling stroke
- Viewport culling via R-tree spatial index

### Property Functions

Every visual property (fill, radius, fontSize, opacity, etc.) can be:

```js
fill: '#CFCCDF'                                     // literal
fill: d => d.color                                   // data-driven
fill: (d, ctx) => ctx.highlighted ? '#fff' : d.color // data + state
```

The `ctx` object contains:
- `zoom` — current zoom level
- Any state keys set via `setState()` (e.g. `ctx.highlighted`, `ctx.dimmed`)

### Levels

Levels define zoom-dependent rendering with collision-based importance. They are ordered by `minZoom` (lowest first). At any given zoom, the highest applicable level is the candidate.

**Key properties:**
- `minZoom` — minimum zoom to show this level (default: 0)
- `maxZoom` — maximum zoom (optional)
- `importance` — function `d => 0..1` for collision gating. Omit for always-visible levels.
- `layers` — array of layer definitions
- `hitArea` — custom hit area for `svg`/`dom`-type layers: `{ type: 'rect', width, height }`

**How collision works:** Nodes with `importance` compete for screen space. More important nodes always win. If a node collides at level N, it falls back to level N-1, and so on down to level 0 (which has no importance gating and always renders).

**Shorthand** — a level with a single shape can omit the `layers` wrapper:

```js
// These are equivalent:
{ type: 'circle', radius: 2, fill: '#CCC' }
{ layers: [{ type: 'circle', radius: 2, fill: '#CCC' }] }
```

**Level transitions** — when a node changes level, it cross-fades over ~150ms.

### Layer Types

| Type | Purpose | Key Properties |
|---|---|---|
| `circle` | Filled circle | `radius`, `fill`, `stroke`, `strokeWidth`, `opacity`, `filter` |
| `rect` | Rectangle | `width`, `height`, `rx`, `ry`, `fill`, `stroke`, `strokeWidth`, `opacity`, `filter` |
| `text` | Text label | `text`, `fontSize`, `fill`, `fontFamily`, `fontWeight`, `anchor`, `offset`, `maxWidth`, `opacity` |
| `svg` | Custom SVG | `create: (data, ctx) => svgString`, `update: (data, ctx, el) => {}`, `width`, `height` |
| `dom` | DOM overlay | `create: (data, ctx) => HTMLElement`, `update: (data, ctx, el) => {}`, `width`, `height` |

All layer types support `visible: d => boolean` for conditional rendering.

**Text anchoring:**
```js
{ type: 'text', text: d => d.name, fontSize: 10,
  anchor: 'top',       // 'top' | 'bottom' | 'left' | 'right' | 'center'
  offset: [0, -6] }    // [dx, dy] in counter-scaled pixels
```

**Text word-wrap:**
```js
{ type: 'text', text: d => d.description, fontSize: 8,
  maxWidth: 120 }      // wraps into multiple lines using <tspan> elements
```

### ForceLayoutAdapter

Wraps ngraph.forcelayout with animation loop, position smoothing, layered orchestration, and stress refinement.

```js
const layout = new ForceLayoutAdapter(graph, {
  springLength: 30,
  springCoefficient: 0.0008,
  gravity: -2.0,
  dragCoefficient: 0.04,
  theta: 0.8,
  timeStep: 20,
  smoothing: 0.15,              // position interpolation (0 = very smooth, 1 = raw)
  maxSpeed: 50,                 // max displacement per frame
  energyThreshold: 0.003,       // convergence threshold
  stableFramesRequired: 10,     // frames below threshold to confirm stability
  layeredLayout: true,          // enable orchestrated layout (default)
  stressThreshold: 0.3,         // edge stretch threshold for refinement
  maxStressIterations: 200,
  getNodeSize: (nodeId) => 10,  // for size-aware spacing
  nodePadding: 4,               // padding between nodes
  onStabilized: () => {},       // called when layout converges
});
```

**Methods:**
- `start()` / `stop()` — control animation loop
- `step()` — single layout iteration (async)
- `stabilize(maxIterations)` — run until stable (async)
- `getNodePosition(nodeId)` — get position (async)
- `setNodePosition(nodeId, x, y)` — set position (async)
- `pinNode(nodeId)` / `unpinNode(nodeId)` — lock/unlock position (async)
- `getPositions()` — get all positions as `Map<id, {x, y}>`
- `getBounds()` — get bounding box (async)
- `isStabilized()` / `isRunning()` — query state
- `onUpdate(callback)` — listen for position updates (called each frame with positions Map)
- `dispose()` — clean up

**Layered orchestration** (enabled by default):
1. Computes onion layers via iterative leaf peeling
2. Pins all nodes, unpins only the structural core
3. After core converges, progressively unpins outer layers
4. Detects and refines stretched edges (stress passes)

The layout automatically restarts when nodes/edges are added to the graph.

### State System

Both NodeCollection and EdgeCollection share the same state API. State keys appear as:
1. Properties on the `ctx` object passed to property functions
2. CSS classes on the SVG element (for external styling)

```js
// Set state
nodeCol.setState('node-1', 'highlighted', true);
edgeCol.setState('edge-1', 'dimmed', true);

// Use state in property functions
fill: (d, ctx) => ctx.highlighted ? '#fff' : '#ccc'
opacity: (d, ctx) => ctx.dimmed ? 0.2 : 1

// Clear state from all nodes/edges
nodeCol.clearState('highlighted');
```

### Graph Binding

When a `graph` option is passed to NodeCollection or EdgeCollection, the collection automatically syncs with the graph — adding/removing visual elements as nodes/edges are added/removed.

NodeCollection also requires a `data` callback when using graph binding:

```js
const nodeCol = new NodeCollection({
  graph,
  data: (graphNode) => ({
    name: graphNode.data?.name || graphNode.id,
    color: graphNode.data?.color || '#4a90d9',
  }),
  levels: [...],
});
```

EdgeCollection stores `fromId` and `toId` from the graph link in each edge's data automatically.

### Other Exports

**DrawContext** — transform/viewport state passed to all renderers:
- `screenToScene(screenX, screenY)` / `sceneToScreen(sceneX, sceneY)` — coordinate conversion
- `isVisible(x, y, radius)` — check viewport visibility
- `getVisibleBounds()` — visible area in scene coordinates
- `getNodeScreenSize(worldSize)` — world-to-screen size conversion

**removeOverlaps(rects, originalPositions, options)** — R-tree based overlap removal for post-layout node positioning. Two-phase: separation, then relaxation toward original positions.

**separatePair(a, b, padding)** — separate two overlapping rectangles.

**intersectCircle / intersectRect / intersectShape** — shape boundary intersection for directed edge arrow placement.

**computeLayers(graph)** — iterative leaf peeling (onion decomposition). Returns `{ layerMap, maxLayer }`.

**computeStressedNodes(graph, layout, threshold)** — find edges deviating from ideal length. Returns `Set<nodeId>`.

## Demos

Run the development server:

```bash
npm run dev
```

- `demo/index.html` — random graph with adaptive detail levels
- `demo/chinese-vocab.html` — Chinese vocabulary hierarchy visualization

## Dependencies

- [ngraph.graph](https://github.com/anvaka/ngraph.graph) — graph data structure
- [ngraph.forcelayout](https://github.com/anvaka/ngraph.forcelayout) — force-directed layout
- [rbush](https://github.com/mourner/rbush) — R-tree spatial index

## License

MIT
