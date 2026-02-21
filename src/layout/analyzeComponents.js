/**
 * Connected component analysis with optional motif detection.
 *
 * Traverses each node at most once and visits each adjacency list once.
 * Motif metadata is derived from the same traversal data with no extra graph pass.
 *
 * @param {Object} graph ngraph.graph instance
 * @param {Object} [options]
 * @param {boolean} [options.detectMotifs=true]
 * @param {number} [options.motifMaxSize=64]
 * @returns {{
 *   components: Array<{
 *     id: number,
 *     nodes: Array<*>,
 *     degrees: Array<number>,
 *     edgeCount: number,
 *     motif: null|'single'|'edge'|'triangle'|'star',
 *     hubId?: *
 *   }>,
 *   nodeToComponent: Map<*, number>
 * }}
 */
export function analyzeComponents(graph, options = {}) {
  const detectMotifs = options.detectMotifs ?? true;
  const motifMaxSize = options.motifMaxSize ?? 64;

  const nodeToComponent = new Map();
  const components = [];
  const queue = [];

  graph.forEachNode((startNode) => {
    if (nodeToComponent.has(startNode.id)) return;

    const componentId = components.length;
    const nodes = [];
    const degrees = [];

    let queueHead = 0;
    let degreeSum = 0;

    queue.length = 0;
    queue.push(startNode.id);
    nodeToComponent.set(startNode.id, componentId);

    while (queueHead < queue.length) {
      const nodeId = queue[queueHead++];
      nodes.push(nodeId);

      let degree = 0;
      graph.forEachLinkedNode(nodeId, (neighbor) => {
        degree += 1;
        if (!nodeToComponent.has(neighbor.id)) {
          nodeToComponent.set(neighbor.id, componentId);
          queue.push(neighbor.id);
        }
      });

      degrees.push(degree);
      degreeSum += degree;
    }

    const edgeCount = degreeSum / 2;
    const component = {
      id: componentId,
      nodes,
      degrees,
      edgeCount,
      motif: null,
      hubId: undefined,
    };

    if (detectMotifs && nodes.length <= motifMaxSize) {
      detectComponentMotif(component);
    }

    components.push(component);
  });

  return { components, nodeToComponent };
}

function detectComponentMotif(component) {
  const nodeCount = component.nodes.length;
  const edgeCount = component.edgeCount;

  if (nodeCount === 1) {
    component.motif = 'single';
    return;
  }

  if (nodeCount === 2 && edgeCount === 1) {
    component.motif = 'edge';
    return;
  }

  if (nodeCount === 3 && edgeCount === 3) {
    component.motif = 'triangle';
    return;
  }

  if (nodeCount < 4 || edgeCount !== nodeCount - 1) return;

  const degrees = component.degrees;
  let hubIndex = -1;
  let hubsFound = 0;

  for (let i = 0; i < degrees.length; ++i) {
    const degree = degrees[i];
    if (degree === nodeCount - 1) {
      hubIndex = i;
      hubsFound += 1;
    } else if (degree !== 1) {
      return;
    }
  }

  if (hubsFound === 1 && hubIndex >= 0) {
    component.motif = 'star';
    component.hubId = component.nodes[hubIndex];
  }
}
