import DrawContext from './DrawContext.js';
import createPanZoom from './controls/createPanZoom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Creates an SVG scene for graph visualization.
 *
 * @param {HTMLElement} container - DOM element to attach the scene to
 * @param {Object} options - Configuration options
 * @param {Object} options.viewBox - Initial viewBox bounds { left, top, right, bottom }
 * @param {Object} options.panZoom - Pan/zoom options { minZoom, maxZoom, enabled }
 * @returns {Object} Scene API
 */
export default function createScene(container, options = {}) {
  const {
    viewBox = { left: -100, top: -100, right: 100, bottom: 100 },
    panZoom: panZoomOptions = {}
  } = options;

  // Create SVG root element
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.style.position = 'relative';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.display = 'block';
  svg.style.overflow = 'hidden';
  container.appendChild(svg);

  // Create transform group - all scene content goes here
  const transformGroup = document.createElementNS(SVG_NS, 'g');
  transformGroup.setAttribute('class', 'scene-transform');
  svg.appendChild(transformGroup);

  // Initialize draw context
  const drawContext = new DrawContext();
  drawContext.setViewBox(viewBox.left, viewBox.top, viewBox.right, viewBox.bottom);

  // Track collections
  const collections = [];

  // Event listeners
  const listeners = {
    render: [],
    transform: [],
    resize: []
  };

  // Animation frame tracking
  let rafId = null;
  let needsRender = true;

  // Update size from container
  function updateSize() {
    const rect = container.getBoundingClientRect();
    drawContext.setSize(rect.width, rect.height);

    // Center the viewBox in the container
    const vbWidth = viewBox.right - viewBox.left;
    const vbHeight = viewBox.bottom - viewBox.top;
    const scaleX = rect.width / vbWidth;
    const scaleY = rect.height / vbHeight;
    const scale = Math.min(scaleX, scaleY);

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const vbCenterX = (viewBox.left + viewBox.right) / 2;
    const vbCenterY = (viewBox.top + viewBox.bottom) / 2;

    drawContext.setTransform(
      scale,
      centerX - vbCenterX * scale,
      centerY - vbCenterY * scale
    );

    emit('resize', { width: rect.width, height: rect.height });
    requestRender();
  }

  // Event emission
  function emit(event, data) {
    const eventListeners = listeners[event];
    if (eventListeners) {
      for (let i = 0; i < eventListeners.length; i++) {
        eventListeners[i](data);
      }
    }
  }

  // Render loop
  function render() {
    rafId = null;
    if (!needsRender) return;
    needsRender = false;

    // Update transform on the group
    transformGroup.setAttribute('transform', drawContext.getTransformString());

    // Update all collections
    for (let i = 0; i < collections.length; i++) {
      collections[i].render(drawContext);
    }

    emit('render', drawContext);
  }

  function requestRender() {
    needsRender = true;
    if (rafId === null) {
      rafId = requestAnimationFrame(render);
    }
  }

  // Initialize pan/zoom
  let panZoom = null;
  if (panZoomOptions.enabled !== false) {
    panZoom = createPanZoom(svg, drawContext, {
      minZoom: panZoomOptions.minZoom || 0.1,
      maxZoom: panZoomOptions.maxZoom || 20,
      onTransform: () => {
        emit('transform', drawContext.transform);
        requestRender();
      }
    });
  }

  // Resize observer
  const resizeObserver = new ResizeObserver(() => {
    updateSize();
  });
  resizeObserver.observe(container);

  // Initial size update
  updateSize();

  // Public API
  const scene = {
    /**
     * The SVG root element
     */
    svg,

    /**
     * The transform group containing all scene content
     */
    root: transformGroup,

    /**
     * The current draw context
     */
    drawContext,

    /**
     * Add a collection to the scene
     */
    addCollection(collection) {
      collections.push(collection);
      const root = collection.getRoot();
      if (root) transformGroup.appendChild(root);
      requestRender();
      return collection;
    },

    /**
     * Remove a collection from the scene
     */
    removeCollection(collection) {
      const idx = collections.indexOf(collection);
      if (idx !== -1) {
        collections.splice(idx, 1);
        const root = collection.getRoot();
        if (root && root.parentNode) {
          root.parentNode.removeChild(root);
        }
        requestRender();
      }
    },

    /**
     * Request a render on the next animation frame
     */
    requestRender,

    /**
     * Add an event listener
     */
    on(event, callback) {
      if (listeners[event]) {
        listeners[event].push(callback);
      }
      return scene;
    },

    /**
     * Remove an event listener
     */
    off(event, callback) {
      if (listeners[event]) {
        const idx = listeners[event].indexOf(callback);
        if (idx !== -1) {
          listeners[event].splice(idx, 1);
        }
      }
      return scene;
    },

    /**
     * Get the pan/zoom controller
     */
    getPanZoom() {
      return panZoom;
    },

    /**
     * Animate camera to a specific position
     */
    flyTo(x, y, scale, duration = 300) {
      if (!panZoom) return Promise.resolve();
      return panZoom.flyTo(x, y, scale, duration);
    },

    /**
     * Fit the view to show all content
     */
    fitToView(bounds, padding = 20) {
      const { width, height } = drawContext;
      const boundsWidth = bounds.right - bounds.left;
      const boundsHeight = bounds.bottom - bounds.top;

      const scaleX = (width - padding * 2) / boundsWidth;
      const scaleY = (height - padding * 2) / boundsHeight;
      const scale = Math.min(scaleX, scaleY);

      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;

      return this.flyTo(centerX, centerY, scale);
    },

    /**
     * Dispose of the scene and clean up resources
     */
    dispose() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      resizeObserver.disconnect();

      if (panZoom) {
        panZoom.dispose();
        panZoom = null;
      }

      // Dispose and clear collections
      for (let i = 0; i < collections.length; i++) {
        if (collections[i].dispose) collections[i].dispose();
      }
      collections.length = 0;

      // Clear listeners
      for (const key in listeners) {
        listeners[key].length = 0;
      }

      // Remove SVG
      if (svg.parentNode) {
        svg.parentNode.removeChild(svg);
      }
    }
  };

  return scene;
}
