/**
 * Iterative leaf peeling (onion decomposition).
 *
 * Repeatedly removes degree-≤1 nodes from the graph, assigning each
 * peeled wave a layer number. Layer 0 = outermost leaves, the highest
 * layer = dense core.
 *
 * @param {Object} graph  ngraph.graph instance
 * @returns {{ layerMap: Map<*, number>, maxLayer: number }}
 */
export function computeLayers(graph) {
  const degree = new Map();
  const layerMap = new Map();

  // 1. Compute initial degree for every node
  graph.forEachNode((node) => {
    let d = 0;
    graph.forEachLinkedNode(node.id, () => { d++; });
    degree.set(node.id, d);
  });

  // 2. Seed the first queue with all degree-≤1 nodes
  let queue = [];
  degree.forEach((d, id) => {
    if (d <= 1) queue.push(id);
  });

  let layer = 0;
  let assigned = 0;
  const totalNodes = degree.size;

  // 3. Peel layers until no more leaves
  while (queue.length > 0) {
    const nextQueue = [];

    for (const id of queue) {
      if (layerMap.has(id)) continue; // already assigned
      layerMap.set(id, layer);
      assigned++;

      // Decrement neighbors' effective degree
      graph.forEachLinkedNode(id, (neighbor) => {
        if (layerMap.has(neighbor.id)) return; // already peeled
        const nd = degree.get(neighbor.id) - 1;
        degree.set(neighbor.id, nd);
        if (nd <= 1) nextQueue.push(neighbor.id);
      });
    }

    queue = nextQueue;
    if (queue.length > 0) layer++;
  }

  // 4. Any remaining nodes (cycles with no leaves) form the core
  if (assigned < totalNodes) {
    layer = assigned === 0 ? 0 : layer + 1;
    degree.forEach((_, id) => {
      if (!layerMap.has(id)) {
        layerMap.set(id, layer);
      }
    });
  }

  return { layerMap, maxLayer: layer };
}
