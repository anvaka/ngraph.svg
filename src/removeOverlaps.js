import RBush from 'rbush';

/**
 * R-tree based overlap removal algorithm.
 *
 * Uses rbush for O(n log n) spatial queries instead of O(n^2) pairwise checks.
 *
 * Two-phase approach:
 *
 * **Phase 1: Separation**
 * - Build R-tree with all rectangle bounding boxes
 * - For each rectangle, query overlapping neighbors
 * - Separate overlapping pairs along axis with minimum overlap
 * - Repeat until no overlaps remain (or max iterations reached)
 *
 * **Phase 2: Relaxation**
 * - For each rectangle, attempt to move toward original position
 * - Only apply movement if it doesn't create new overlaps
 * - This preserves graph structure while eliminating overlaps
 *
 * @param {Array<{id: any, x: number, y: number, width: number, height: number}>} rects
 *   Array of rectangles to process. Positions are mutated in place.
 * @param {Map<any, {x: number, y: number}>} originalPositions
 *   Original positions to relax toward (preserves structure)
 * @param {Object} options
 * @param {number} [options.iterations=100] - Max separation iterations
 * @param {number} [options.padding=4] - Minimum gap between rectangles
 */
export function removeOverlaps(rects, originalPositions, options = {}) {
  const iterations = options.iterations ?? 100;
  const padding = options.padding ?? 4;

  const tree = new RBush();

  // Phase 1: Remove all overlaps completely
  for (let iter = 0; iter < iterations; iter++) {
    tree.clear();
    const items = rects.map(r => ({
      minX: r.x - r.width / 2,
      minY: r.y - r.height / 2,
      maxX: r.x + r.width / 2,
      maxY: r.y + r.height / 2,
      rect: r
    }));
    tree.load(items);

    let hasOverlap = false;
    const processed = new Set();

    for (const item of items) {
      // Search with padding to find nearby nodes
      const candidates = tree.search({
        minX: item.minX - padding,
        minY: item.minY - padding,
        maxX: item.maxX + padding,
        maxY: item.maxY + padding
      });

      for (const other of candidates) {
        if (other.rect === item.rect) continue;

        // Use consistent pair key for deduplication
        const ids = [item.rect.id, other.rect.id];
        ids.sort();
        const pairKey = ids[0] + '|' + ids[1];
        if (processed.has(pairKey)) continue;
        processed.add(pairKey);

        if (separatePair(item.rect, other.rect, padding)) {
          hasOverlap = true;
        }
      }
    }

    if (!hasOverlap) break;
  }

  // Phase 2: Try to move nodes back toward original positions without creating overlaps
  const relaxIterations = 20;
  const relaxStrength = 0.1;

  for (let iter = 0; iter < relaxIterations; iter++) {
    tree.clear();
    const items = rects.map(r => ({
      minX: r.x - r.width / 2,
      minY: r.y - r.height / 2,
      maxX: r.x + r.width / 2,
      maxY: r.y + r.height / 2,
      rect: r
    }));
    tree.load(items);

    for (const rect of rects) {
      const orig = originalPositions.get(rect.id);
      if (!orig) continue;

      // Proposed movement toward original
      const dx = (orig.x - rect.x) * relaxStrength;
      const dy = (orig.y - rect.y) * relaxStrength;

      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) continue;

      // Check if movement would create overlap
      const newX = rect.x + dx;
      const newY = rect.y + dy;

      const candidates = tree.search({
        minX: newX - rect.width / 2 - padding,
        minY: newY - rect.height / 2 - padding,
        maxX: newX + rect.width / 2 + padding,
        maxY: newY + rect.height / 2 + padding
      });

      let canMove = true;
      for (const other of candidates) {
        if (other.rect === rect) continue;

        // Check if new position would overlap
        const ox = (rect.width / 2 + other.rect.width / 2 + padding) - Math.abs(newX - other.rect.x);
        const oy = (rect.height / 2 + other.rect.height / 2 + padding) - Math.abs(newY - other.rect.y);

        if (ox > 0 && oy > 0) {
          canMove = false;
          break;
        }
      }

      if (canMove) {
        rect.x = newX;
        rect.y = newY;
      }
    }
  }
}

/**
 * Separate two overlapping rectangles along the axis with minimum overlap.
 *
 * Strategy: Move along the axis with less overlap to minimize displacement.
 * Movement is split inversely proportional to each rectangle's `degree` field,
 * so high-degree hub nodes stay put while low-degree leaves absorb the shift.
 *
 * @param {{x: number, y: number, width: number, height: number, degree?: number}} a - First rectangle (mutated)
 * @param {{x: number, y: number, width: number, height: number, degree?: number}} b - Second rectangle (mutated)
 * @param {number} padding - Additional gap to enforce between rectangles
 * @returns {boolean} True if separation was needed, false if no overlap
 */
export function separatePair(a, b, padding = 0) {
  // Calculate overlap on each axis
  const ox = (a.width / 2 + b.width / 2 + padding) - Math.abs(a.x - b.x);
  const oy = (a.height / 2 + b.height / 2 + padding) - Math.abs(a.y - b.y);

  // No overlap if either axis has no intersection
  if (ox <= 0 || oy <= 0) return false;

  // Weight: nodes with more connections move less.
  // Inverse of (1 + degree) so a leaf (degree 1) has weight 0.5,
  // a hub (degree 20) has weight ~0.048, etc.
  const aWeight = 1 / (1 + (a.degree || 0));
  const bWeight = 1 / (1 + (b.degree || 0));
  const total = aWeight + bWeight;
  const aRatio = aWeight / total;
  const bRatio = bWeight / total;

  // Move along axis with minimum overlap (less disruption)
  if (ox < oy) {
    const sign = (a.x > b.x) ? 1 : -1;
    const shift = ox + 0.2; // Total separation needed
    a.x += shift * sign * aRatio;
    b.x -= shift * sign * bRatio;
  } else {
    const sign = (a.y > b.y) ? 1 : -1;
    const shift = oy + 0.2;
    a.y += shift * sign * aRatio;
    b.y -= shift * sign * bRatio;
  }

  return true;
}
