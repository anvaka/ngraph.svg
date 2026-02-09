/**
 * Shape intersection utilities for computing where a line from a direction
 * vector exits a shape boundary.
 *
 * All functions take a normalized direction vector (pointing FROM the shape center
 * toward the other endpoint) and return an offset FROM the shape center to the
 * boundary point.
 */

/**
 * Compute intersection offset for a circle.
 * @param {number} dirX - Normalized direction X (from center toward other node)
 * @param {number} dirY - Normalized direction Y
 * @param {number} radius - Circle radius in world coordinates
 * @returns {{ x: number, y: number }} Offset from center to boundary
 */
export function intersectCircle(dirX, dirY, radius) {
  return {
    x: dirX * radius,
    y: dirY * radius
  };
}

/**
 * Compute intersection offset for a rectangle.
 * Uses ray-box intersection to find where the direction vector exits the rect.
 * @param {number} dirX - Normalized direction X (from center toward other node)
 * @param {number} dirY - Normalized direction Y
 * @param {number} halfWidth - Half-width of the rectangle
 * @param {number} halfHeight - Half-height of the rectangle
 * @returns {{ x: number, y: number }} Offset from center to boundary
 */
export function intersectRect(dirX, dirY, halfWidth, halfHeight) {
  // Avoid division by zero
  const absDx = Math.abs(dirX) || 1e-10;
  const absDy = Math.abs(dirY) || 1e-10;

  // Time to hit vertical and horizontal edges
  const tx = halfWidth / absDx;
  const ty = halfHeight / absDy;

  // Take the smaller t — that's where the ray exits the rect
  const t = Math.min(tx, ty);

  return {
    x: dirX * t,
    y: dirY * t
  };
}

/**
 * Compute intersection offset for any supported shape descriptor.
 * @param {number} dirX - Normalized direction X
 * @param {number} dirY - Normalized direction Y
 * @param {{ type: string, radius?: number, width?: number, height?: number }} shape
 * @returns {{ x: number, y: number }} Offset from center to boundary
 */
export function intersectShape(dirX, dirY, shape) {
  if (shape.type === 'circle') {
    return intersectCircle(dirX, dirY, shape.radius);
  }
  if (shape.type === 'rect') {
    return intersectRect(dirX, dirY, shape.width / 2, shape.height / 2);
  }
  // Default: treat as point
  return { x: 0, y: 0 };
}
