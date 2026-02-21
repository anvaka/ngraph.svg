import createGraph from 'ngraph.graph';
import {
  createScene,
  NodeCollection,
  CanvasEdgeCollection,
  ForceLayoutAdapter,
} from '../src/index.js';

const container = document.getElementById('container');
const scene = createScene(container, {
  viewBox: { left: -500, top: -500, right: 500, bottom: 500 },
  panZoom: { minZoom: 0.1, maxZoom: 40 },
});

const edges = new CanvasEdgeCollection({
  container,
  color: 'rgba(142, 180, 255, 0.45)',
  width: 0.7,
  opacity: 0.7,
});

const nodes = new NodeCollection({
  maxScale: 2,
  levels: [
    { type: 'circle', radius: 2, fill: d => d.color },
    {
      minZoom: 1.8,
      importance: d => d.degree,
      layers: [
        { type: 'circle', radius: 4, fill: d => d.color },
      ],
    },
  ],
});

scene.addCollection(edges);
scene.addCollection(nodes);

const componentCountInput = document.getElementById('componentCount');
const avgSizeInput = document.getElementById('avgSize');
const singlePercentInput = document.getElementById('singlePercent');
const seedInput = document.getElementById('seed');
const componentLayoutInput = document.getElementById('componentLayout');
const motifLayoutInput = document.getElementById('motifLayout');

const componentCountValue = document.getElementById('componentCountValue');
const avgSizeValue = document.getElementById('avgSizeValue');
const singlePercentValue = document.getElementById('singlePercentValue');
const seedValue = document.getElementById('seedValue');

const statNodes = document.getElementById('statNodes');
const statEdges = document.getElementById('statEdges');
const statComponents = document.getElementById('statComponents');
const statFrames = document.getElementById('statFrames');
const statTime = document.getElementById('statTime');
const statZoom = document.getElementById('statZoom');

const btnGenerate = document.getElementById('btnGenerate');
const btnReset = document.getElementById('btnReset');
const btnToggleLayout = document.getElementById('btnToggleLayout');

let graph = null;
let layout = null;
let nodeHandles = new Map();
let edgeHandles = new Map();
let layoutRunning = false;
let frameCount = 0;
let stabilizeStart = 0;
let componentCount = 0;

updateSliderLabels();

componentCountInput.addEventListener('input', updateSliderLabels);
avgSizeInput.addEventListener('input', updateSliderLabels);
singlePercentInput.addEventListener('input', updateSliderLabels);
seedInput.addEventListener('input', updateSliderLabels);

btnGenerate.addEventListener('click', () => {
  regenerate();
});

btnReset.addEventListener('click', async () => {
  if (!layout) return;
  const bounds = await layout.getBounds();
  scene.fitToView(bounds, 40);
});

btnToggleLayout.addEventListener('click', () => {
  if (!layout) return;

  if (layoutRunning) {
    layout.stop();
    layoutRunning = false;
    btnToggleLayout.textContent = 'Resume';
  } else {
    layout.start();
    layoutRunning = true;
    btnToggleLayout.textContent = 'Pause';
  }
});

scene.on('transform', (transform) => {
  statZoom.textContent = `${transform.scale.toFixed(2)}x`;
});

regenerate();

function updateSliderLabels() {
  componentCountValue.textContent = componentCountInput.value;
  avgSizeValue.textContent = avgSizeInput.value;
  singlePercentValue.textContent = singlePercentInput.value;
  seedValue.textContent = seedInput.value;
}

function regenerate() {
  if (layout) {
    layout.stop();
    layout.dispose();
    layout = null;
  }

  nodeHandles.clear();
  edgeHandles.clear();
  nodes.clear();
  edges.clear();

  const options = {
    componentCount: Number(componentCountInput.value),
    avgSize: Number(avgSizeInput.value),
    singlePercent: Number(singlePercentInput.value),
    seed: Number(seedInput.value),
  };

  const generated = generateDisconnectedGraph(options);
  graph = generated.graph;
  componentCount = generated.componentCount;

  graph.forEachNode((node) => {
    const data = node.data;
    const visual = nodes.add({
      id: node.id,
      x: 0,
      y: 0,
      data: {
        color: data.color,
        degree: data.degree,
      },
    });
    nodeHandles.set(node.id, visual);
  });

  graph.forEachLink((link) => {
    const id = `${link.fromId}|${link.toId}`;
    const edge = edges.add({
      id,
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
    });
    edgeHandles.set(id, { edge, link });
  });

  layout = new ForceLayoutAdapter(graph, {
    springLength: 30,
    springCoefficient: 0.0008,
    dragCoefficient: 0.04,
    gravity: -2,
    stableFramesRequired: 4,
    energyThreshold: 0.006,
    smoothing: 0.2,
    componentLayout: componentLayoutInput.checked,
    motifLayout: motifLayoutInput.checked,
    onStabilized: () => {
      const elapsed = performance.now() - stabilizeStart;
      statFrames.textContent = String(frameCount);
      statTime.textContent = `${elapsed.toFixed(1)} ms`;
    },
  });

  frameCount = 0;
  stabilizeStart = performance.now();
  statFrames.textContent = '-';
  statTime.textContent = '-';

  layout.onUpdate((positions) => {
    frameCount += 1;
    updateVisualPositions(positions);
  });

  layout.start();
  layoutRunning = true;
  btnToggleLayout.textContent = 'Pause';

  updateStats(generated.nodeCount, generated.edgeCount, componentCount);
}

function updateVisualPositions(positions) {
  positions.forEach((pos, nodeId) => {
    const node = nodeHandles.get(nodeId);
    if (node) {
      nodes.setPosition(node, pos.x, pos.y);
    }
  });

  edgeHandles.forEach(({ edge, link }) => {
    const fromPos = positions.get(link.fromId);
    const toPos = positions.get(link.toId);
    if (!fromPos || !toPos) return;
    edges.setEndpoints(edge, fromPos.x, fromPos.y, toPos.x, toPos.y);
  });

  scene.requestRender();
}

function updateStats(nodeCount, edgeCount, components) {
  statNodes.textContent = String(nodeCount);
  statEdges.textContent = String(edgeCount);
  statComponents.textContent = String(components);
}

function generateDisconnectedGraph(options) {
  const graph = createGraph();
  const rng = createRng(options.seed);

  const requestedComponents = options.componentCount;
  const avgSize = options.avgSize;
  const singlePercent = clamp(options.singlePercent ?? 20, 0, 100);
  const singleComponentCount = Math.floor(requestedComponents * (singlePercent / 100));
  const remainingAfterSingles = Math.max(0, requestedComponents - singleComponentCount);
  const pairComponentCount = Math.floor(remainingAfterSingles * 0.2);

  let totalNodes = 0;
  let totalEdges = 0;

  for (let componentIndex = 0; componentIndex < requestedComponents; ++componentIndex) {
    const size = resolveComponentSize(
      componentIndex,
      requestedComponents,
      singleComponentCount,
      pairComponentCount,
      avgSize,
      rng
    );
    const baseId = `c${componentIndex}`;

    const nodeIds = new Array(size);
    for (let i = 0; i < size; ++i) {
      const nodeId = `${baseId}:n${i}`;
      const color = getColor(componentIndex, requestedComponents);
      graph.addNode(nodeId, { color, degree: 0 });
      nodeIds[i] = nodeId;
    }

    const motifType = pickMotifType(size, rng);
    totalEdges += buildComponentEdges(graph, nodeIds, motifType, rng);
    totalNodes += size;
  }

  graph.forEachNode((node) => {
    const links = graph.getLinks(node.id);
    node.data.degree = links ? (links.size ?? links.length ?? 0) : 0;
  });

  return {
    graph,
    nodeCount: totalNodes,
    edgeCount: totalEdges,
    componentCount: requestedComponents,
  };
}

function resolveComponentSize(index, totalComponents, singleCount, pairCount, avgSize, rng) {
  if (index < singleCount) return 1;
  if (index < singleCount + pairCount) return 2;

  const sampled = sampleComponentSize(avgSize, rng);
  const remaining = totalComponents - index;

  if (remaining <= 0) return sampled;
  if (sampled > 2) return sampled;

  return 3;
}

function sampleComponentSize(avgSize, rng) {
  const min = 1;
  const max = Math.max(2, avgSize * 2);
  const spread = 0.45 + rng() * 1.1;
  const value = Math.round(avgSize * spread);
  return clamp(value, min, max);
}

function pickMotifType(size, rng) {
  if (size === 1) return 'single';
  if (size === 2) return 'edge';
  if (size === 3) {
    return rng() < 0.7 ? 'triangle' : 'tree';
  }
  if (size >= 4 && rng() < 0.22) return 'star';
  return 'tree';
}

function buildComponentEdges(graph, nodeIds, motifType, rng) {
  const size = nodeIds.length;
  let edgeCount = 0;

  if (motifType === 'single') return edgeCount;

  if (motifType === 'edge') {
    graph.addLink(nodeIds[0], nodeIds[1]);
    return 1;
  }

  if (motifType === 'triangle') {
    graph.addLink(nodeIds[0], nodeIds[1]);
    graph.addLink(nodeIds[1], nodeIds[2]);
    graph.addLink(nodeIds[2], nodeIds[0]);
    return 3;
  }

  if (motifType === 'star') {
    for (let i = 1; i < size; ++i) {
      graph.addLink(nodeIds[0], nodeIds[i]);
      edgeCount += 1;
    }
    return edgeCount;
  }

  for (let i = 1; i < size; ++i) {
    const parent = Math.floor(rng() * i);
    graph.addLink(nodeIds[i], nodeIds[parent]);
    edgeCount += 1;
  }

  const extraTarget = Math.floor(size * 0.18);
  for (let i = 0; i < extraTarget; ++i) {
    const from = Math.floor(rng() * size);
    let to = Math.floor(rng() * size);
    if (to === from) to = (to + 1) % size;
    graph.addLink(nodeIds[from], nodeIds[to]);
    edgeCount += 1;
  }

  return edgeCount;
}

function getColor(index, total) {
  const hue = Math.round((index / Math.max(1, total)) * 360);
  return `hsl(${hue}, 72%, 62%)`;
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
