import createGraph from 'ngraph.graph';
import {
  createScene,
  NodeCollection,
  EdgeCollection,
  ForceLayoutAdapter
} from '../src/index.js';

// Create container
const container = document.getElementById('container');

// Create the scene
const scene = createScene(container, {
  viewBox: { left: -200, top: -200, right: 200, bottom: 200 },
  panZoom: {
    minZoom: 0.1,
    maxZoom: 50
  }
});

// Create collections for nodes and edges
const edges = new EdgeCollection({
  color: '#4a5568',
  width: 0.5,
  opacity: 0.4
});

const nodes = new NodeCollection({
  maxScale: 2,

  levels: [
    // Base: colored dot
    { type: 'circle', radius: 2, fill: d => d.color },

    // Zoom >= 1: bigger dot
    { minZoom: 1,
      type: 'circle', radius: 4, fill: d => d.color },

    // Zoom >= 2: glow effect
    { minZoom: 2,
      layers: [
        { type: 'circle', radius: 8, fill: d => d.color, opacity: 0.3, filter: 'url(#glow)' },
        { type: 'circle', radius: 6, fill: d => d.color },
      ] },

    // Zoom >= 4: circle with label (collision-gated)
    { minZoom: 4, importance: d => d.degree || 0,
      layers: [
        { type: 'circle', radius: 8, fill: d => d.color },
        { type: 'text', text: d => d.label, fontSize: 10, fill: '#fff',
          anchor: 'bottom', offset: [0, 20] },
      ] },

    // Zoom >= 8: card (collision-gated)
    { minZoom: 8, importance: d => d.degree || 0,
      layers: [
        { type: 'rect', width: 140, height: 80, rx: 8, fill: d => d.color, opacity: 0.9 },
        { type: 'text', text: d => d.label, fontSize: 14, fill: '#fff',
          fontWeight: 'bold', offset: [0, -8] },
        { type: 'text', text: d => d.description, fontSize: 11,
          fill: 'rgba(255,255,255,0.8)', offset: [0, 12] },
      ] },
  ],
});

// Add collections to scene (edges first so they're behind nodes)
scene.addCollection(edges);
scene.addCollection(nodes);

// Create a graph
const graph = createGraph();

// Generate some initial nodes and edges
generateRandomGraph(30, 50);

// After graph is built, compute degrees for label importance
let maxDegree = 1;
graph.forEachNode(node => {
  const links = graph.getLinks(node.id);
  const degree = links ? (links.size ?? links.length ?? 0) : 0;
  node.data.degree = degree;
  if (degree > maxDegree) maxDegree = degree;
});

// Create force layout with size-aware spacing
const layout = new ForceLayoutAdapter(graph, {
  springLength: 30,
  springCoefficient: 0.0005
});

// Map graph nodes to visual nodes
const nodeMap = new Map();
const edgeMap = new Map();

// Initialize visual elements from graph (only for nodes that have positions)
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

// Create a visual node from graph node + position
function addVisualNode(node, pos) {
  return nodes.add({
    id: node.id,
    x: pos.x,
    y: pos.y,
    data: {
      label: node.data?.label || `Node ${node.id}`,
      color: node.data?.color || getRandomColor(),
      description: node.data?.description || `ID: ${node.id}`,
      degree: node.data?.degree || 0,
    }
  });
}

// Update visuals from layout positions (lazily creates visuals for new nodes)
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

  // Update edge positions
  edgeMap.forEach(({ edge, link }) => {
    const fromPos = positions.get(link.fromId);
    const toPos = positions.get(link.toId);
    if (fromPos && toPos) {
      edges.setEndpoints(edge, fromPos.x, fromPos.y, toPos.x, toPos.y);
    }
  });

  scene.requestRender();
}

// Start layout
syncGraphToVisuals().then(() => {
  layout.onUpdate(updatePositions);
  layout.start();
});

// Update stats
function updateStats() {
  document.getElementById('nodeCount').textContent = nodes.count;
  document.getElementById('edgeCount').textContent = edges.count;
}

// Track zoom level
scene.on('transform', (transform) => {
  document.getElementById('zoomLevel').textContent = transform.scale.toFixed(2) + 'x';
});

// Controls
document.getElementById('btnReset').addEventListener('click', async () => {
  const bounds = await layout.getBounds();
  scene.fitToView(bounds, 50);
});

let layoutRunning = true;
document.getElementById('btnToggleLayout').addEventListener('click', () => {
  if (layoutRunning) {
    layout.stop();
    document.getElementById('btnToggleLayout').textContent = 'Resume Layout';
  } else {
    layout.start();
    document.getElementById('btnToggleLayout').textContent = 'Pause Layout';
  }
  layoutRunning = !layoutRunning;
});

document.getElementById('btnAddNodes').addEventListener('click', async () => {
  const existingNodes = [];
  graph.forEachNode(n => { existingNodes.push(n.id); });

  const startId = existingNodes.length;
  const positions = layout.getPositions();

  for (let i = 0; i < 10; i++) {
    const nodeId = startId + i;
    graph.addNode(nodeId, {
      label: `Node ${nodeId}`,
      color: getRandomColor(),
      size: 8 + Math.random() * 8,
      degree: 0
    });

    // Connect to random existing node
    if (existingNodes.length > 0) {
      const targetId = existingNodes[Math.floor(Math.random() * existingNodes.length)];
      graph.addLink(nodeId, targetId);

      // Update degrees for both nodes
      const newNode = graph.getNode(nodeId);
      const targetNode = graph.getNode(targetId);
      if (newNode) newNode.data.degree = (newNode.data.degree || 0) + 1;
      if (targetNode) targetNode.data.degree = (targetNode.data.degree || 0) + 1;

      // Update maxDegree if needed
      if (targetNode && targetNode.data.degree > maxDegree) {
        maxDegree = targetNode.data.degree;
      }

      // Position new node near its connected node
      const targetPos = positions.get(targetId);
      if (targetPos) {
        await layout.setNodePosition(nodeId,
          targetPos.x + (Math.random() - 0.5) * 50,
          targetPos.y + (Math.random() - 0.5) * 50
        );
      }
    }
    existingNodes.push(nodeId);
  }

  await syncGraphToVisuals();
  updateStats();
});

updateStats();

// Initial fit to view after layout stabilizes a bit
setTimeout(async () => {
  const bounds = await layout.getBounds();
  scene.fitToView(bounds, 50);
}, 500);

// Helper functions

function generateRandomGraph(nodeCount, edgeCount) {
  for (let i = 0; i < nodeCount; i++) {
    graph.addNode(i, {
      label: `Node ${i}`,
      color: getRandomColor(),
      size: 8 + Math.random() * 8,
      description: `This is node number ${i}`
    });
  }

  for (let i = 0; i < edgeCount; i++) {
    const from = Math.floor(Math.random() * nodeCount);
    const to = Math.floor(Math.random() * nodeCount);
    if (from !== to) {
      graph.addLink(from, to);
    }
  }
}

function getRandomColor() {
  const colors = [
    '#4a90d9', '#6dd5ed', '#c471ed', '#f64f59',
    '#12c2e9', '#f5af19', '#11998e', '#38ef7d',
    '#ee0979', '#ff6a00', '#a8c0ff', '#3f2b96'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Add SVG filter for glow effect
const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
defs.innerHTML = `
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
    <feMerge>
      <feMergeNode in="coloredBlur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
`;
scene.svg.insertBefore(defs, scene.svg.firstChild);
