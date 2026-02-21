/**
 * Packs component bounds into rows using a shelf strategy.
 * Returns translation offsets per component index.
 *
 * Input bounds are expected to be local (before any component offset).
 *
 * @param {Array<{id: number, width: number, height: number}>} components
 * @param {number} [padding=80]
 * @returns {Array<{x: number, y: number}>}
 */
export function packComponents(components, padding = 80) {
  const count = components.length;
  const offsets = new Array(count);
  if (count === 0) return offsets;

  let totalArea = 0;
  for (let i = 0; i < count; ++i) {
    const c = components[i];
    totalArea += (c.width + padding) * (c.height + padding);
  }

  const targetRowWidth = Math.max(200, Math.sqrt(totalArea) * 1.3);

  const order = new Array(count);
  for (let i = 0; i < count; ++i) order[i] = i;
  order.sort((a, b) => {
    const da = components[a];
    const db = components[b];
    return db.height - da.height;
  });

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (let i = 0; i < order.length; ++i) {
    const idx = order[i];
    const component = components[idx];

    if (cursorX > 0 && cursorX + component.width > targetRowWidth) {
      cursorX = 0;
      cursorY += rowHeight + padding;
      rowHeight = 0;
    }

    offsets[idx] = { x: cursorX, y: cursorY };

    cursorX += component.width + padding;
    if (component.height > rowHeight) rowHeight = component.height;
  }

  // Center the packed arrangement around (0, 0)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < count; ++i) {
    const component = components[i];
    const offset = offsets[i];
    const left = offset.x - component.width * 0.5;
    const top = offset.y - component.height * 0.5;
    const right = left + component.width;
    const bottom = top + component.height;

    if (left < minX) minX = left;
    if (top < minY) minY = top;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }

  const shiftX = (minX + maxX) * 0.5;
  const shiftY = (minY + maxY) * 0.5;

  for (let i = 0; i < count; ++i) {
    offsets[i].x -= shiftX;
    offsets[i].y -= shiftY;
  }

  return offsets;
}
