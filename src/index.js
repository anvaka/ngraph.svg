/**
 * ngraph.svg - SVG-based graph visualization with adaptive rendering
 *
 * @example
 * import { createScene, NodeCollection, EdgeCollection, ForceLayoutAdapter } from 'ngraph.svg';
 *
 * const scene = createScene(container, { panZoom: { minZoom: 0.1, maxZoom: 50 } });
 * const nodes = new NodeCollection({
 *   graph,
 *   data: (node) => ({ label: node.data?.label || node.id }),
 *   levels: [
 *     { type: 'circle', radius: 2, fill: '#4a90d9' },
 *     { minZoom: 2, layers: [
 *       { type: 'circle', radius: 4, fill: '#4a90d9' },
 *       { type: 'text', text: d => d.label, fontSize: 10, fill: '#fff', anchor: 'top', offset: [0, -8] },
 *     ] },
 *   ],
 * });
 * scene.addCollection(nodes);
 *
 * @see README.md for full documentation
 */

// Core - Scene creation and rendering context
export { default as createScene } from './createScene.js';
export { default as DrawContext } from './DrawContext.js';
// Collections - Batched rendering for nodes and edges
export { default as NodeCollection } from './collections/NodeCollection.js';
export { default as EdgeCollection } from './collections/EdgeCollection.js';

// Layout - Force-directed graph layout integration
export { default as ForceLayoutAdapter } from './layout/ForceLayoutAdapter.js';
export { computeLayers } from './layout/computeLayers.js';
export { computeStressedNodes } from './layout/computeStressedNodes.js';

// Overlap removal - R-tree based overlap removal for post-layout processing
export { removeOverlaps, separatePair } from './removeOverlaps.js';

// Controls - Pan, zoom, and interaction handlers
export { default as createPanZoom } from './controls/createPanZoom.js';
export { default as createMouseController } from './controls/createMouseController.js';
export { default as createTouchController } from './controls/createTouchController.js';
export { default as createKineticAnimation } from './controls/createKineticAnimation.js';

// Shape intersection utilities
export { intersectCircle, intersectRect, intersectShape } from './intersectShape.js';

// Utilities - R-tree spatial index (useful for overlap removal, collision detection)
export { default as RBush } from 'rbush';
