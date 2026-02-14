/**
 * Manages a DOM overlay container that sits on top of the SVG scene.
 *
 * The parent container mirrors the SVG transformGroup's transform
 * (translate + scale), so pan/zoom is a single CSS update. Individual
 * card elements are positioned in world coordinates with a contentScale
 * factor that matches NodeCollection's counter-scaling — ensuring DOM
 * cards scale identically to SVG node content.
 */
export default class DomOverlay {
  constructor(svgElement) {
    this._svg = svgElement;
    this._elements = new Map(); // nodeId -> { el, attached, stateVersion }
    this._restoreTimer = 0;

    this._onSvgWheel = this._handleSvgWheel.bind(this);
    this._svg.addEventListener('wheel', this._onSvgWheel);

    this._container = this._createContainer();
    this._injectStyle();
  }

  _createContainer() {
    const container = document.createElement('div');
    // Zero-size anchor; children overflow visibly via translate.
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '0';
    container.style.height = '0';
    container.style.transformOrigin = '0 0';
    container.style.pointerEvents = 'none';

    const parent = this._svg.parentNode;
    if (parent) {
      const cs = getComputedStyle(parent);
      if (cs.position === 'static') parent.style.position = 'relative';
      parent.insertBefore(container, this._svg.nextSibling);
    }

    return container;
  }

  /**
   * Inject a one-off stylesheet rule that suppresses pointer events on all
   * children when the container has the suppressed class. The !important
   * overrides any inline pointer-events:auto set by the consumer.
   */
  _injectStyle() {
    if (document.getElementById('dom-overlay-style')) return;
    const style = document.createElement('style');
    style.id = 'dom-overlay-style';
    style.textContent =
      '.dom-overlay--suppressed > * { pointer-events: none !important; }';
    document.head.appendChild(style);
  }

  /**
   * When the user wheels on the SVG (zooming), suppress interactivity on
   * all DOM overlay children so cards that drift under the cursor can't
   * capture subsequent wheel ticks. Restore after 150ms of no wheel events.
   */
  _handleSvgWheel() {
    this._container.classList.add('dom-overlay--suppressed');
    clearTimeout(this._restoreTimer);
    this._restoreTimer = setTimeout(() => {
      this._container.classList.remove('dom-overlay--suppressed');
    }, 150);
  }

  /**
   * Sync the overlay transform with the SVG scene transform.
   * Called once per frame.
   */
  syncTransform(drawContext) {
    const t = drawContext.transform;
    this._container.style.transform =
      `translate(${t.x}px,${t.y}px) scale(${t.scale})`;
  }

  /**
   * Get or create a DOM element for the given node.
   * `createFn(data, ctx)` is only called on first encounter.
   */
  ensureElement(nodeId, data, ctx, createFn) {
    let entry = this._elements.get(nodeId);
    if (!entry) {
      const el = createFn(data, ctx);
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.transformOrigin = '0 0';
      el.style.pointerEvents = 'none';
      entry = { el, attached: false, stateVersion: -1 };
      this._elements.set(nodeId, entry);
    }
    return entry;
  }

  /**
   * Call the update callback if the node's state version has changed.
   */
  updateState(nodeId, data, ctx, updateFn, stateVersion) {
    const entry = this._elements.get(nodeId);
    if (!entry || entry.stateVersion === stateVersion) return;
    entry.stateVersion = stateVersion;
    updateFn(data, ctx, entry.el);
  }

  /**
   * Set a DOM element's position in world coordinates with counter-scale.
   * contentScale matches NodeCollection's maxScale / zoom capping.
   * halfW/halfH offset the element so its center aligns with (worldX, worldY),
   * matching SVG node centering behavior.
   */
  setPosition(nodeId, worldX, worldY, contentScale, halfW, halfH) {
    const entry = this._elements.get(nodeId);
    if (entry) {
      // halfW/halfH are in the element's local (unscaled) coordinates.
      // After scale(cs), local (halfW, halfH) occupies cs*halfW, cs*halfH
      // in the parent's space, so the translate offset must compensate for that.
      const ox = worldX - (halfW || 0) * contentScale;
      const oy = worldY - (halfH || 0) * contentScale;
      entry.el.style.transform =
        `translate(${ox}px,${oy}px) scale(${contentScale})`;
    }
  }

  /**
   * Attach the element to the overlay container (make visible).
   */
  attach(nodeId) {
    const entry = this._elements.get(nodeId);
    if (entry && !entry.attached) {
      this._container.appendChild(entry.el);
      entry.attached = true;
    }
  }

  /**
   * Detach the element from the overlay container (hide, but keep cached).
   */
  detach(nodeId) {
    const entry = this._elements.get(nodeId);
    if (entry && entry.attached) {
      this._container.removeChild(entry.el);
      entry.attached = false;
    }
  }

  /**
   * Remove a node's DOM element entirely (detach + delete from cache).
   */
  remove(nodeId) {
    const entry = this._elements.get(nodeId);
    if (entry) {
      if (entry.attached && entry.el.parentNode) {
        entry.el.parentNode.removeChild(entry.el);
      }
      this._elements.delete(nodeId);
    }
  }

  dispose() {
    clearTimeout(this._restoreTimer);
    this._svg.removeEventListener('wheel', this._onSvgWheel);
    if (this._container) {
      if (this._container.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }
    }
    this._elements.clear();
    this._container = null;
  }
}
