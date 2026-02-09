/**
 * Identifies edges whose actual length deviates from their ideal spring
 * length by more than `stressThreshold` (relative), and returns the
 * stressed endpoints together with their 1-hop neighbors.
 *
 * @param {Object} graph          ngraph.graph instance
 * @param {Object} layout         ngraph.forcelayout instance
 * @param {number} [stressThreshold=0.3]  relative deviation (0.3 = 30%)
 * @returns {Set<*>}  node IDs that should be unfrozen for stress refinement
 */
export function computeStressedNodes(graph, layout, stressThreshold = 0.3) {
  const stressed = new Set();

  graph.forEachLink((link) => {
    const fromPos = layout.getNodePosition(link.fromId);
    const toPos = layout.getNodePosition(link.toId);
    if (!fromPos || !toPos) return;

    const dx = fromPos.x - toPos.x;
    const dy = fromPos.y - toPos.y;
    const actualLength = Math.sqrt(dx * dx + dy * dy);

    // Get the ideal spring length from the layout's internal spring data
    const spring = layout.getSpring(link.fromId, link.toId);
    if (!spring) return;
    const idealLength = spring.length;
    if (idealLength <= 0) return;

    const deviation = Math.abs(actualLength - idealLength) / idealLength;
    if (deviation > stressThreshold) {
      stressed.add(link.fromId);
      stressed.add(link.toId);
    }
  });

  // Expand to 1-hop neighbors
  const expanded = new Set(stressed);
  for (const id of stressed) {
    graph.forEachLinkedNode(id, (neighbor) => {
      expanded.add(neighbor.id);
    });
  }

  return expanded;
}
