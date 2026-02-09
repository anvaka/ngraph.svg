/**
 * DrawContext holds transform/viewport state passed to all renderers.
 * It provides helpers for adaptive rendering calculations.
 */
export default class DrawContext {
  constructor() {
    this.viewBox = { left: -100, top: -100, right: 100, bottom: 100 };
    this.transform = { scale: 1, x: 0, y: 0 };
    this.width = 0;
    this.height = 0;
    this.pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

    // Cached visible bounds to avoid per-node allocations
    this._visibleBounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this._visibleBoundsDirty = true;

    // Preallocated points to avoid per-call allocations
    this._reusableScenePoint = { x: 0, y: 0 };
    this._reusableScreenPoint = { x: 0, y: 0 };
  }

  /**
   * Update the viewport dimensions
   */
  setSize(width, height) {
    this.width = width;
    this.height = height;
    this._visibleBoundsDirty = true;
  }

  /**
   * Update the viewBox bounds
   */
  setViewBox(left, top, right, bottom) {
    this.viewBox.left = left;
    this.viewBox.top = top;
    this.viewBox.right = right;
    this.viewBox.bottom = bottom;
  }

  /**
   * Update the transform state
   */
  setTransform(scale, x, y) {
    this.transform.scale = scale;
    this.transform.x = x;
    this.transform.y = y;
    this._visibleBoundsDirty = true;
  }

  /**
   * Calculate how many pixels a node of given size occupies on screen.
   * This is the core metric for adaptive rendering decisions.
   */
  getNodeScreenSize(nodeSize) {
    return nodeSize * this.transform.scale;
  }

  /**
   * Convert screen coordinates to scene coordinates
   */
  screenToScene(screenX, screenY) {
    const p = this._reusableScenePoint;
    p.x = (screenX - this.transform.x) / this.transform.scale;
    p.y = (screenY - this.transform.y) / this.transform.scale;
    return p;
  }

  /**
   * Convert scene coordinates to screen coordinates
   */
  sceneToScreen(sceneX, sceneY) {
    const p = this._reusableScreenPoint;
    p.x = sceneX * this.transform.scale + this.transform.x;
    p.y = sceneY * this.transform.scale + this.transform.y;
    return p;
  }

  /**
   * Get the visible bounds in scene coordinates
   */
  /**
   * Returns the cached visible bounds object. Callers must not modify it.
   */
  getVisibleBounds() {
    this._updateVisibleBounds();
    return this._visibleBounds;
  }

  _updateVisibleBounds() {
    if (this._visibleBoundsDirty) {
      this._visibleBoundsDirty = false;
      const s = this.transform.scale;
      const tx = this.transform.x;
      const ty = this.transform.y;
      this._visibleBounds.left = (0 - tx) / s;
      this._visibleBounds.top = (0 - ty) / s;
      this._visibleBounds.right = (this.width - tx) / s;
      this._visibleBounds.bottom = (this.height - ty) / s;
    }
  }

  /**
   * Check if a point with given radius is visible in the viewport
   */
  isVisible(x, y, radius = 0) {
    this._updateVisibleBounds();
    const bounds = this._visibleBounds;
    return (
      x + radius >= bounds.left &&
      x - radius <= bounds.right &&
      y + radius >= bounds.top &&
      y - radius <= bounds.bottom
    );
  }

  /**
   * Get the SVG transform string for the current state
   */
  getTransformString() {
    return `translate(${this.transform.x}, ${this.transform.y}) scale(${this.transform.scale})`;
  }
}
