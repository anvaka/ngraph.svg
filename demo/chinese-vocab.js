import createGraph from 'ngraph.graph';
import {
  createScene,
  NodeCollection,
  EdgeCollection,
  ForceLayoutAdapter,
  removeOverlaps
} from '../src/index.js';

// DOM elements
const container = document.getElementById('container');
const categorySelect = document.getElementById('categorySelect');
const depthSlider = document.getElementById('depthSlider');
const depthValue = document.getElementById('depthValue');
const btnReset = document.getElementById('btnReset');
const btnToggleLayout = document.getElementById('btnToggleLayout');
const nodeCountEl = document.getElementById('nodeCount');
const edgeCountEl = document.getElementById('edgeCount');
const zoomLevelEl = document.getElementById('zoomLevel');
const layoutStatusEl = document.getElementById('layoutStatus');
const wordDetailPanel = document.getElementById('wordDetail');
const closeDetailBtn = document.getElementById('closeDetail');

// State
let hypernymData = null;
let graph = null;
let scene = null;
let nodes = null;
let edges = null;
let layout = null;
let layoutRunning = true;
let nodeMap = new Map();
let edgeMap = new Map();
let selectedNodeId = null;

// Data path - relative to demo folder
const DATA_PATH = './hypernym-dag-v2.json';

// Show loading indicator
const loadingEl = document.createElement('div');
loadingEl.className = 'loading';
loadingEl.textContent = 'Loading vocabulary data';
document.body.appendChild(loadingEl);

// Initialize
async function init() {
  try {
    // Load hypernym DAG data
    const response = await fetch(DATA_PATH);
    hypernymData = await response.json();

    // Remove loading indicator
    loadingEl.remove();

    // Create scene
    scene = createScene(container, {
      viewBox: { left: -300, top: -300, right: 300, bottom: 300 },
      panZoom: {
        minZoom: 0.1,
        maxZoom: 50
      }
    });

    // Create collections
    edges = new EdgeCollection({
      color: '#c7c7cc',
      width: 0.5,
      opacity: 0.4
    });

    const importance = d => d.degree || 0;

    nodes = new NodeCollection({
      maxScale: 2,

      levels: [
        // Base: just hanzi text
        {
          type: 'text', text: d => d.hanzi, fontSize: 10,
          fill: '#48484a',
          fontFamily: "'Noto Sans SC', -apple-system, sans-serif",
          fontWeight: '600',
        },

        // Zoom >= 0.7: hanzi with HSK color dot
        { minZoom: 0.7,
          layers: [
            { type: 'circle', radius: 3, fill: d => getHskColor(d.hsk), opacity: 0.3 },
            { type: 'text', text: d => d.hanzi, fontSize: 11,
              fill: '#1d1d1f',
              fontFamily: "'Noto Sans SC', -apple-system, sans-serif",
              fontWeight: '600' },
          ] },

        // Zoom >= 1.7: hanzi + pinyin in box (collision-gated)
        { minZoom: 1.7, importance,
          hitArea: { type: 'rect', width: d => Math.max(50, d.hanzi.length * 16 + 20), height: 36 },
          layers: [
            { type: 'render',
              render: (data, ctx) => {
                const charCount = data.hanzi.length;
                const width = Math.max(50, charCount * 16 + 20);
                const halfW = width / 2;
                return `
                  <rect x="${-halfW}" y="-18" width="${width}" height="36" rx="6"
                    fill="white" stroke="#d2d2d7" stroke-width="1"/>
                  <text
                    y="${data.pinyin ? -4 : 0}"
                    text-anchor="middle"
                    dominant-baseline="${data.pinyin ? 'auto' : 'central'}"
                    font-size="14"
                    font-weight="600"
                    fill="#1d1d1f"
                    font-family="'Noto Sans SC', -apple-system, sans-serif"
                  >${data.hanzi}</text>`;
              } },
            { type: 'text', text: d => d.pinyin, fontSize: 9, fill: '#86868b',
              anchor: 'bottom', offset: [0, 10], visible: d => !!d.pinyin },
          ] },

        // Zoom >= 4: card with hanzi, pinyin, short definition (collision-gated)
        { minZoom: 4, importance,
          hitArea: { type: 'rect', width: d => Math.max(90, d.hanzi.length * 20 + 30), height: 64 },
          layers: [
            { type: 'render',
              render: (data, ctx) => {
                const shortDef = data.definition ?
                  (data.definition.length > 12 ? data.definition.slice(0, 12) + '...' : data.definition) : '';
                const hskColor = getHskColor(data.hsk);
                const charCount = data.hanzi.length;
                const width = Math.max(90, charCount * 20 + 30);
                const halfW = width / 2;
                return `
                  <rect x="${-halfW}" y="-32" width="${width}" height="64" rx="10"
                    fill="white" stroke="#d2d2d7" stroke-width="1.5"
                    filter="url(#card-shadow)"/>
                  ${data.hsk ? `
                    <rect x="${halfW - 22}" y="-28" width="18" height="14" rx="3" fill="${hskColor}"/>
                    <text x="${halfW - 13}" y="-18" text-anchor="middle" font-size="8" fill="white" font-weight="600">${data.hsk}</text>
                  ` : ''}
                  <text
                    y="-8"
                    text-anchor="middle"
                    font-size="18"
                    font-weight="700"
                    fill="#1d1d1f"
                    font-family="'Noto Sans SC', -apple-system, sans-serif"
                  >${data.hanzi}</text>
                  ${data.pinyin ? `
                    <text
                      y="8"
                      text-anchor="middle"
                      font-size="11"
                      fill="#0071e3"
                      font-weight="500"
                      font-family="-apple-system, sans-serif"
                    >${data.pinyin}</text>
                  ` : ''}
                  ${shortDef ? `
                    <text
                      y="22"
                      text-anchor="middle"
                      font-size="9"
                      fill="#86868b"
                      font-family="-apple-system, sans-serif"
                    >${shortDef}</text>
                  ` : ''}`;
              } },
          ] },

        // Zoom >= 8: full card with all details (collision-gated)
        { minZoom: 8, importance,
          hitArea: { type: 'rect', width: d => Math.max(130, d.hanzi.length * 28 + 40), height: 90 },
          layers: [
            { type: 'render',
              render: (data, ctx) => {
                const hskColor = getHskColor(data.hsk);
                const definition = data.definition || '';
                const charCount = data.hanzi.length;
                const width = Math.max(130, charCount * 28 + 40);
                const halfW = width / 2;
                const truncatedDef = definition.length > 18 ? definition.slice(0, 18) + '...' : definition;
                return `
                  <rect x="${-halfW}" y="-45" width="${width}" height="90" rx="12"
                    fill="white" stroke="#d2d2d7" stroke-width="1.5"
                    filter="url(#card-shadow)"/>
                  ${data.hsk ? `
                    <rect x="${halfW - 28}" y="-40" width="24" height="16" rx="4" fill="${hskColor}"/>
                    <text x="${halfW - 16}" y="-28" text-anchor="middle" font-size="10" fill="white" font-weight="600">HSK${data.hsk}</text>
                  ` : ''}
                  <text
                    y="-14"
                    text-anchor="middle"
                    font-size="26"
                    font-weight="700"
                    fill="#1d1d1f"
                    font-family="'Noto Sans SC', -apple-system, sans-serif"
                  >${data.hanzi}</text>
                  ${data.pinyin ? `
                    <text
                      y="6"
                      text-anchor="middle"
                      font-size="14"
                      fill="#0071e3"
                      font-weight="500"
                      font-family="-apple-system, sans-serif"
                    >${data.pinyin}</text>
                  ` : ''}
                  ${definition ? `
                    <text
                      y="26"
                      text-anchor="middle"
                      font-size="11"
                      fill="#48484a"
                      font-family="-apple-system, sans-serif"
                    >${truncatedDef}</text>
                  ` : ''}`;
              } },
          ] },
      ],
    });

    // Add collections to scene (edges behind nodes)
    scene.addCollection(edges);
    scene.addCollection(nodes);

    // Add SVG defs for filters
    addSvgDefs(scene.svg);

    // Build initial graph
    await buildGraph(categorySelect.value, parseInt(depthSlider.value));

    // Track zoom level
    scene.on('transform', (transform) => {
      zoomLevelEl.textContent = transform.scale.toFixed(2) + 'x';
    });

    // Set up event handlers
    setupEventHandlers();

  } catch (error) {
    console.error('Failed to initialize:', error);
    loadingEl.textContent = 'Failed to load data: ' + error.message;
  }
}

/**
 * Build graph from a root category
 */
async function buildGraph(rootCategory, maxDepth) {
  // Clear existing graph
  if (layout) {
    layout.stop();
    layout.dispose();
  }
  if (nodes) nodes.clear();
  if (edges) edges.clear();
  nodeMap.clear();
  edgeMap.clear();

  // Create new graph
  graph = createGraph();

  // BFS to collect nodes up to maxDepth
  const visited = new Set();
  const queue = [{ word: rootCategory, depth: 0 }];
  visited.add(rootCategory);

  while (queue.length > 0) {
    const { word, depth } = queue.shift();

    // Add node
    const wordInfo = hypernymData.wordInfo?.[word] || {};
    const definition = hypernymData.definitions?.[word] || '';
    const freq = hypernymData.freq?.[word] || 0;

    graph.addNode(word, {
      hanzi: word,
      pinyin: wordInfo.pinyin || '',
      hsk: wordInfo.hsk || null,
      definition: definition,
      freq: freq,
      depth: depth
    });

    // Add children if within depth limit
    if (depth < maxDepth) {
      const children = hypernymData.children?.[word] || [];
      for (const child of children) {
        if (!visited.has(child)) {
          visited.add(child);
          queue.push({ word: child, depth: depth + 1 });

          // Add edge from parent to child
          graph.addLink(word, child);
        } else if (graph.hasNode(child)) {
          // Add edge even if already visited (for DAG connections)
          if (!graph.hasLink(word, child)) {
            graph.addLink(word, child);
          }
        }
      }
    }
  }

  // Compute degrees for label importance
  graph.forEachNode(node => {
    const links = graph.getLinks(node.id);
    const degree = links ? (links.size ?? links.length ?? 0) : 0;
    node.data.degree = degree;
  });

  // Create layout with stability detection
  layout = new ForceLayoutAdapter(graph, {
    springLength: 50,
    springCoefficient: 0.0004,
    gravity: -1.5,
    energyThreshold: 0.5,
    onStabilized: async () => {
      // Fit to view first so overlap removal uses the correct zoom
      let bounds = await layout.getBounds();
      await scene.fitToView(bounds, 80);

      layoutStatusEl.textContent = 'Removing overlaps...';
      await removeNodeOverlaps();

      // Re-fit after overlap removal (bounds may have expanded)
      bounds = await layout.getBounds();
      await scene.fitToView(bounds, 80);

      layoutStatusEl.textContent = 'Stable';
      layoutRunning = false;
      btnToggleLayout.textContent = 'Resume Layout';
    }
  });

  // Sync graph to visuals
  await syncGraphToVisuals();

  // Start layout
  layout.onUpdate(updatePositions);
  await layout.start();
  layoutRunning = true;
  layoutStatusEl.textContent = 'Running';
  btnToggleLayout.textContent = 'Pause Layout';

  // Update stats
  updateStats();
}

/**
 * Sync graph nodes/edges to visual collections (only for nodes with positions)
 */
async function syncGraphToVisuals() {
  const positions = layout.getPositions();

  nodes.beginBatch();
  edges.beginBatch();

  graph.forEachNode((node) => {
    if (nodeMap.has(node.id)) return;
    const pos = positions.get(node.id);
    if (!pos) return; // not yet revealed by layout orchestration

    nodeMap.set(node.id, addVisualNode(node, pos));
  });

  graph.forEachLink((link) => {
    const edgeId = `${link.fromId}-${link.toId}`;
    if (edgeMap.has(edgeId)) return;
    const fromPos = positions.get(link.fromId);
    const toPos = positions.get(link.toId);
    if (!fromPos || !toPos) return;

    const visualEdge = edges.add({
      id: edgeId,
      fromX: fromPos.x, fromY: fromPos.y,
      toX: toPos.x, toY: toPos.y
    });
    edgeMap.set(edgeId, { edge: visualEdge, link });
  });

  nodes.endBatch();
  edges.endBatch();
}

/**
 * Create a visual node from graph node + position
 */
function addVisualNode(node, pos) {
  return nodes.add({
    id: node.id,
    x: pos.x,
    y: pos.y,
    data: {
      ...node.data,
      degree: node.data.degree || 0
    }
  });
}

/**
 * Update visual positions from layout (lazily creates visuals for new nodes)
 */
function updatePositions(positions) {
  let needsBatch = false;

  positions.forEach((pos, nodeId) => {
    let visualNode = nodeMap.get(nodeId);
    if (!visualNode) {
      // Node just appeared (new layer unpinned) — create visual on the fly
      const graphNode = graph.getNode(nodeId);
      if (!graphNode) return;
      if (!needsBatch) { nodes.beginBatch(); edges.beginBatch(); needsBatch = true; }
      visualNode = addVisualNode(graphNode, pos);
      nodeMap.set(nodeId, visualNode);
      // Also create edges for this node
      graph.forEachLinkedNode(nodeId, (_neighbor, link) => {
        const edgeId = `${link.fromId}-${link.toId}`;
        if (edgeMap.has(edgeId)) return;
        const fromPos = positions.get(link.fromId);
        const toPos = positions.get(link.toId);
        if (!fromPos || !toPos) return;
        const visualEdge = edges.add({
          id: edgeId,
          fromX: fromPos.x, fromY: fromPos.y,
          toX: toPos.x, toY: toPos.y
        });
        edgeMap.set(edgeId, { edge: visualEdge, link });
      });
    }
    nodes.setPosition(visualNode, pos.x, pos.y);
  });

  if (needsBatch) { nodes.endBatch(); edges.endBatch(); }

  updateEdgePositions(positions);
  scene.requestRender();
}

/**
 * Update edge positions from current layout positions
 */
function updateEdgePositions(positions) {
  if (!positions) {
    positions = layout.getPositions();
  }
  edgeMap.forEach(({ edge, link }) => {
    const fromPos = positions.get(link.fromId);
    const toPos = positions.get(link.toId);
    if (fromPos && toPos) {
      edges.setEndpoints(edge, fromPos.x, fromPos.y, toPos.x, toPos.y);
    }
  });
}

/**
 * Get node dimensions based on zoom level for overlap removal
 */
function getNodeDimensions(nodeData) {
  const charCount = nodeData.hanzi.length;
  // Use the card dimensions for overlap removal (medium card)
  return { width: Math.max(50, charCount * 16 + 20), height: 36 };
}

/**
 * Remove overlapping nodes after layout stabilizes
 */
async function removeNodeOverlaps() {
  const positions = layout.getPositions();

  const zoom = scene.drawContext.transform.scale;
  const maxScale = 2;
  const contentScale = Math.min(1, maxScale / zoom);

  const rects = [];
  const originalPositions = new Map();

  positions.forEach((pos, nodeId) => {
    const graphNode = graph.getNode(nodeId);
    if (!graphNode) return;

    originalPositions.set(nodeId, { x: pos.x, y: pos.y });
    const dims = getNodeDimensions(graphNode.data);
    const links = graph.getLinks(nodeId);
    const degree = links ? (links.size ?? links.length ?? 0) : 0;
    rects.push({
      id: nodeId,
      x: pos.x,
      y: pos.y,
      width: (dims.width + 8) * contentScale,
      height: (dims.height + 8) * contentScale,
      degree
    });
  });

  removeOverlaps(rects, originalPositions, {
    iterations: 100,
    padding: 4
  });

  const newPositions = new Map();
  for (const rect of rects) {
    newPositions.set(rect.id, { x: rect.x, y: rect.y });
  }

  await animatePositions(originalPositions, newPositions, 300);
}

/**
 * Animate node positions from old to new over duration (ms).
 */
function animatePositions(oldPositions, newPositions, duration) {
  return new Promise((resolve) => {
    const startTime = performance.now();

    function tick(currentTime) {
      const elapsed = currentTime - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - t, 3);

      // Interpolate positions
      const currentPositions = new Map();
      newPositions.forEach((newPos, nodeId) => {
        const oldPos = oldPositions.get(nodeId) || newPos;
        const x = oldPos.x + (newPos.x - oldPos.x) * eased;
        const y = oldPos.y + (newPos.y - oldPos.y) * eased;
        currentPositions.set(nodeId, { x, y });

        // Update visual node
        const visualNode = nodeMap.get(nodeId);
        if (visualNode) {
          nodes.setPosition(visualNode, x, y);
        }
      });

      // Update edges
      updateEdgePositions(currentPositions);
      scene.requestRender();

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        // Final positions - update layout engine
        newPositions.forEach((pos, nodeId) => {
          layout.setNodePosition(nodeId, pos.x, pos.y);
        });
        resolve();
      }
    }

    requestAnimationFrame(tick);
  });
}

/**
 * Get HSK level color
 */
function getHskColor(hsk) {
  const colors = {
    1: '#34c759',
    2: '#5ac8fa',
    3: '#007aff',
    4: '#5856d6',
    5: '#af52de',
    6: '#ff3b30'
  };
  return colors[hsk] || '#8e8e93';
}

/**
 * Add SVG defs for filters and gradients
 */
function addSvgDefs(svg) {
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.1"/>
    </filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  `;
  svg.insertBefore(defs, svg.firstChild);
}

/**
 * Set up event handlers
 */
function setupEventHandlers() {
  // Category change
  categorySelect.addEventListener('change', async () => {
    await buildGraph(categorySelect.value, parseInt(depthSlider.value));
  });

  // Depth change
  depthSlider.addEventListener('input', () => {
    depthValue.textContent = depthSlider.value;
  });

  depthSlider.addEventListener('change', async () => {
    await buildGraph(categorySelect.value, parseInt(depthSlider.value));
  });

  // Reset view
  btnReset.addEventListener('click', async () => {
    if (layout) {
      const bounds = await layout.getBounds();
      scene.fitToView(bounds, 80);
    }
  });

  // Toggle layout
  btnToggleLayout.addEventListener('click', () => {
    if (layoutRunning) {
      layout.stop();
      layoutStatusEl.textContent = 'Paused';
      btnToggleLayout.textContent = 'Resume Layout';
    } else {
      layout.start();
      layoutStatusEl.textContent = 'Running';
      btnToggleLayout.textContent = 'Pause Layout';
    }
    layoutRunning = !layoutRunning;
  });

  // Close detail panel
  closeDetailBtn.addEventListener('click', () => {
    wordDetailPanel.classList.add('hidden');
    selectedNodeId = null;
  });

  // Node click - show detail
  container.addEventListener('click', (e) => {
    // Find if click is on a node
    const nodeEl = e.target.closest('.node');
    if (nodeEl) {
      for (const [nodeId, visualNode] of nodeMap) {
        if (visualNode._element === nodeEl) {
          showWordDetail(nodeId);
          break;
        }
      }
    }
  });
}

/**
 * Show word detail panel
 */
function showWordDetail(nodeId) {
  const graphNode = graph.getNode(nodeId);
  if (!graphNode) return;

  const data = graphNode.data;
  selectedNodeId = nodeId;

  document.getElementById('detailHanzi').textContent = data.hanzi;
  document.getElementById('detailPinyin').textContent = data.pinyin || '-';
  document.getElementById('detailDefinition').textContent = data.definition || 'No definition available';

  const hskEl = document.getElementById('detailHsk');
  if (data.hsk) {
    hskEl.textContent = `HSK ${data.hsk}`;
    hskEl.className = `word-hsk hsk-${data.hsk}`;
  } else {
    hskEl.textContent = 'HSK ?';
    hskEl.className = 'word-hsk hsk-unknown';
  }

  wordDetailPanel.classList.remove('hidden');
}

/**
 * Update stats display
 */
function updateStats() {
  nodeCountEl.textContent = nodes ? nodes.count : 0;
  edgeCountEl.textContent = edges ? edges.count : 0;
}

// Start the application
init();
