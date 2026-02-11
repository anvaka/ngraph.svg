import generators from 'ngraph.generators';
import {
  createScene,
  NodeCollection,
  CanvasEdgeCollection,
  ForceLayoutAdapter
} from '../src/index.js';

// Color palette for graph coloring
const palette = [
  '#4a90d9', '#6dd5ed', '#c471ed', '#f64f59',
  '#12c2e9', '#f5af19', '#11998e', '#38ef7d',
  '#ee0979', '#ff6a00', '#a8c0ff'
];

// Graph catalog — each entry creates a graph and defines how to style nodes
const graphCatalog = {
  miserables: {
    name: 'Les Miserables',
    create() { return generators.miserables(); },
    nodeData(node) {
      const d = node.data || {};
      const group = d.group ?? 0;
      return {
        label: d.name || String(node.id),
        color: d.color || palette[group % palette.length],
        description: `Group ${group}`
      };
    }
  },
  wattsStrogatz: {
    name: 'Watts-Strogatz',
    create() { return generators.wattsStrogatz(100, 8, 0.1); },
    nodeData(node) {
      const d = node.data || {};
      return {
        label: d.label || String(node.id),
        color: d.color || palette[node.id % palette.length],
        description: `Node ${node.id}`
      };
    }
  },
  grid: {
    name: 'Grid 10x10',
    create() { return generators.grid(10, 10); },
    nodeData(node) {
      const d = node.data || {};
      const row = Math.floor(node.id / 10);
      return {
        label: d.label || String(node.id),
        color: d.color || palette[row % palette.length],
        description: `Row ${row}`
      };
    }
  },
  balancedBinTree: {
    name: 'Binary Tree',
    create() { return generators.balancedBinTree(6); },
    nodeData(node) {
      const d = node.data || {};
      const depth = Math.floor(Math.log2(node.id || 1));
      return {
        label: d.label || String(node.id),
        color: d.color || palette[depth % palette.length],
        description: `Depth ${depth}`
      };
    }
  },
  cliqueCircle: {
    name: 'Clique Circle',
    create() { return generators.cliqueCircle(6, 5); },
    nodeData(node) {
      const d = node.data || {};
      const clique = Math.floor(node.id / 5);
      return {
        label: d.label || String(node.id),
        color: d.color || palette[clique % palette.length],
        description: `Clique ${clique}`
      };
    }
  },
  completeBipartite: {
    name: 'Complete Bipartite',
    create() { return generators.completeBipartite(5, 8); },
    nodeData(node) {
      const d = node.data || {};
      const partition = node.id < 5 ? 0 : 1;
      return {
        label: d.label || String(node.id),
        color: d.color || (partition === 0 ? '#4a90d9' : '#f64f59'),
        description: partition === 0 ? 'Partition A' : 'Partition B'
      };
    }
  }
};

// Create container
const container = document.getElementById('container');

// Create the scene
const scene = createScene(container, {
  viewBox: { left: -500, top: -500, right: 500, bottom: 500 },
  panZoom: { minZoom: 0.1, maxZoom: 50 }
});

// Create collections for nodes and edges
const edges = new CanvasEdgeCollection({
  container,
  color: '#4a5568',
  width: 0.5,
  opacity: 0.4
});

const nodes = new NodeCollection({
  maxScale: 2,
  levels: [
    // Fallback: dot only (no importance — always shows, catches collisions)
    { type: 'circle', radius: 3, fill: d => d.color },
    // Labeled node (collision-gated). Glow added at zoom >= 2.
    { importance: d => d.degree || 0,
      layers: [
        { type: 'circle', radius: 8, fill: d => d.color, opacity: 0.3, filter: 'url(#glow)',
          visible: (d, ctx) => ctx.zoom >= 2 },
        { type: 'circle', radius: (d, ctx) => ctx.zoom >= 2 ? 6 : 4, fill: d => d.color },
        { type: 'text', text: d => d.label, fontSize: 10, fill: '#fff',
          anchor: 'bottom', offset: [0, 16] },
      ] },
    // Zoom >= 6: card with description
    { minZoom: 6, importance: d => d.degree || 0,
      layers: [
        { type: 'rect', width: 140, height: 80, rx: 8, fill: d => d.color, opacity: 0.9 },
        { type: 'text', text: d => d.label, fontSize: 14, fill: '#fff',
          fontWeight: 'bold', offset: [0, -8] },
        { type: 'text', text: d => d.description, fontSize: 11,
          fill: 'rgba(255,255,255,0.8)', offset: [0, 12] },
      ] },
  ],
});

scene.addCollection(edges);
scene.addCollection(nodes);

// State
let graph = null;
let layout = null;
let nodeMap = new Map();
let edgeMap = new Map();
let maxDegree = 1;
let layoutRunning = true;

// Sync graph nodes/edges to visual collections
async function syncGraphToVisuals() {
  const positions = layout.getPositions();
  const catalogEntry = graphCatalog[document.getElementById('graphType').value];

  nodes.beginBatch();
  edges.beginBatch();

  graph.forEachNode((node) => {
    if (nodeMap.has(node.id)) return;
    const pos = positions.get(node.id);
    if (!pos) return;
    nodeMap.set(node.id, addVisualNode(node, pos, catalogEntry));
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

function addVisualNode(node, pos, catalogEntry) {
  const nd = catalogEntry.nodeData(node);
  return nodes.add({
    id: node.id,
    x: pos.x,
    y: pos.y,
    data: {
      label: nd.label,
      color: nd.color,
      description: nd.description,
      degree: node.data?.degree || 0,
    }
  });
}

function updatePositions(positions) {
  const catalogEntry = graphCatalog[document.getElementById('graphType').value];
  let needsBatch = false;

  positions.forEach((pos, nodeId) => {
    let visualNode = nodeMap.get(nodeId);
    if (!visualNode) {
      const graphNode = graph.getNode(nodeId);
      if (!graphNode) return;
      if (!needsBatch) { nodes.beginBatch(); edges.beginBatch(); needsBatch = true; }
      visualNode = addVisualNode(graphNode, pos, catalogEntry);
      nodeMap.set(nodeId, visualNode);
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

  edgeMap.forEach(({ edge, link }) => {
    const fromPos = positions.get(link.fromId);
    const toPos = positions.get(link.toId);
    if (fromPos && toPos) {
      edges.setEndpoints(edge, fromPos.x, fromPos.y, toPos.x, toPos.y);
    }
  });

  scene.requestRender();
}

function updateStats() {
  document.getElementById('nodeCount').textContent = nodes.count;
  document.getElementById('edgeCount').textContent = edges.count;
}

function computeDegrees() {
  maxDegree = 1;
  graph.forEachNode(node => {
    const links = graph.getLinks(node.id);
    const degree = links ? (links.size ?? links.length ?? 0) : 0;
    if (!node.data) node.data = {};
    node.data.degree = degree;
    if (degree > maxDegree) maxDegree = degree;
  });
}

function loadGraph(graphType) {
  // Stop and dispose current layout
  if (layout) {
    layout.stop();
    layout.dispose();
  }

  // Clear visuals
  nodeMap.clear();
  edgeMap.clear();
  nodes.clear();
  edges.clear();

  // Create new graph
  const entry = graphCatalog[graphType];
  graph = entry.create();

  // Compute degrees
  computeDegrees();

  // Create layout with faster phase transitions for snappy onion peeling
  layout = new ForceLayoutAdapter(graph, {
    springLength: 30,
    springCoefficient: 0.0005,
    stableFramesRequired: 3,
    energyThreshold: 0.01,
  });

  layout.onUpdate(updatePositions);
  layout.start();
  layoutRunning = true;
  document.getElementById('btnToggleLayout').textContent = 'Pause Layout';
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
      color: palette[Math.floor(Math.random() * palette.length)],
      degree: 0
    });

    if (existingNodes.length > 0) {
      const targetId = existingNodes[Math.floor(Math.random() * existingNodes.length)];
      graph.addLink(nodeId, targetId);

      const newNode = graph.getNode(nodeId);
      const targetNode = graph.getNode(targetId);
      if (newNode) newNode.data.degree = (newNode.data.degree || 0) + 1;
      if (targetNode) targetNode.data.degree = (targetNode.data.degree || 0) + 1;
      if (targetNode && targetNode.data.degree > maxDegree) {
        maxDegree = targetNode.data.degree;
      }

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

// Graph type selector
document.getElementById('graphType').addEventListener('change', (e) => {
  loadGraph(e.target.value);
});

// Load initial graph
loadGraph('miserables');

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
