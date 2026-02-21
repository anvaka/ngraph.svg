/**
 * Applies deterministic local coordinates for known tiny motifs.
 * Coordinates are centered around (0, 0). Caller can translate as needed.
 *
 * @param {Object} component
 * @param {Map<*, {x: number, y: number}>} positions
 * @param {(nodeId: any) => number} getNodeSize
 */
export function applyMotifLayout(component, positions, getNodeSize) {
  const motif = component.motif;
  if (!motif) return;

  const nodes = component.nodes;
  if (motif === 'single') {
    const nodeId = nodes[0];
    writePosition(positions, nodeId, 0, 0);
    return;
  }

  if (motif === 'edge') {
    const a = nodes[0];
    const b = nodes[1];
    const distance = getEdgeDistance(getNodeSize(a), getNodeSize(b));
    const half = distance * 0.5;
    writePosition(positions, a, -half, 0);
    writePosition(positions, b, half, 0);
    return;
  }

  if (motif === 'triangle') {
    const n0 = nodes[0];
    const n1 = nodes[1];
    const n2 = nodes[2];
    const side = Math.max(
      getEdgeDistance(getNodeSize(n0), getNodeSize(n1)),
      getEdgeDistance(getNodeSize(n1), getNodeSize(n2)),
      getEdgeDistance(getNodeSize(n2), getNodeSize(n0))
    );

    const h = side * 0.8660254037844386;
    writePosition(positions, n0, 0, -h * (2 / 3));
    writePosition(positions, n1, -side * 0.5, h * (1 / 3));
    writePosition(positions, n2, side * 0.5, h * (1 / 3));
    return;
  }

  if (motif === 'star') {
    const hubId = component.hubId;
    if (hubId === undefined) return;

    writePosition(positions, hubId, 0, 0);

    const leafCount = nodes.length - 1;
    if (leafCount <= 0) return;

    const hubSize = getNodeSize(hubId);
    const radius = Math.max(
      24,
      hubSize + 12 + leafCount * 0.8
    );

    const step = (Math.PI * 2) / leafCount;
    let leafIndex = 0;
    for (let i = 0; i < nodes.length; ++i) {
      const nodeId = nodes[i];
      if (nodeId === hubId) continue;
      const angle = leafIndex * step;
      const leafRadius = radius + getNodeSize(nodeId) * 0.1;
      writePosition(
        positions,
        nodeId,
        Math.cos(angle) * leafRadius,
        Math.sin(angle) * leafRadius
      );
      leafIndex += 1;
    }
  }
}

function writePosition(positions, nodeId, x, y) {
  const pos = positions.get(nodeId);
  if (pos) {
    pos.x = x;
    pos.y = y;
  } else {
    positions.set(nodeId, { x, y });
  }
}

function getEdgeDistance(sizeA, sizeB) {
  const minDist = (sizeA + sizeB) * 0.5 + 4;
  return Math.max(30, minDist);
}
