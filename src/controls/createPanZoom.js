import createMouseController from './createMouseController.js';
import createTouchController from './createTouchController.js';
import createKineticAnimation from './createKineticAnimation.js';

/**
 * Pan/zoom orchestrator that coordinates controllers and applies transforms.
 *
 * @param {SVGElement} element - The SVG element to attach controls to
 * @param {DrawContext} drawContext - The draw context to update
 * @param {Object} options - Configuration options
 */
export default function createPanZoom(element, drawContext, options = {}) {
  const {
    onTransform = () => {}
  } = options;

  // Mutable zoom limits
  let minZoom = options.minZoom || 0.1;
  let maxZoom = options.maxZoom || 20;

  // Controllers
  let mouseController = null;
  let touchController = null;
  let kineticAnimation = null;

  // Track flyTo animation for cancellation
  let flyToRafId = null;
  let flyToResolve = null;

  // Apply a pan delta
  function applyPan(dx, dy) {
    const { x, y, scale } = drawContext.transform;
    drawContext.setTransform(scale, x + dx, y + dy);
    onTransform();
  }

  // Apply zoom at a specific point
  function applyZoom(factor, screenX, screenY) {
    const { x, y, scale } = drawContext.transform;

    // Calculate new scale with limits
    let newScale = scale * factor;
    newScale = Math.max(minZoom, Math.min(maxZoom, newScale));

    if (newScale === scale) return;

    // Zoom towards the point under cursor
    // The point under cursor should stay in the same place
    const scaleRatio = newScale / scale;
    const newX = screenX - (screenX - x) * scaleRatio;
    const newY = screenY - (screenY - y) * scaleRatio;

    drawContext.setTransform(newScale, newX, newY);
    onTransform();
  }

  // Kinetic animation for momentum scrolling
  kineticAnimation = createKineticAnimation({
    onUpdate(dx, dy) {
      applyPan(dx, dy);
    }
  });

  // Controller callbacks
  const controllerCallbacks = {
    onPanStart() {
      kineticAnimation.startTracking();
    },
    onPanMove({ dx, dy }) {
      applyPan(dx, dy);
      kineticAnimation.track(dx, dy);
    },
    onPanEnd() {
      kineticAnimation.release();
    },
    onZoom({ factor, x, y }) {
      applyZoom(factor, x, y);
    }
  };

  // Initialize controllers
  mouseController = createMouseController(element, controllerCallbacks);
  touchController = createTouchController(element, controllerCallbacks);

  function cancelFlyTo() {
    if (flyToRafId !== null) {
      cancelAnimationFrame(flyToRafId);
      flyToRafId = null;
    }
    if (flyToResolve) {
      flyToResolve();
      flyToResolve = null;
    }
  }

  return {
    /**
     * Set the zoom limits
     */
    setZoomLimits(min, max) {
      minZoom = min;
      maxZoom = max;
    },

    /**
     * Get the current zoom level
     */
    getZoom() {
      return drawContext.transform.scale;
    },

    /**
     * Set the zoom level
     */
    setZoom(scale, animate = false) {
      if (animate) {
        // Fly to current viewport center at new scale
        const centerX = (drawContext.width / 2 - drawContext.transform.x) / drawContext.transform.scale;
        const centerY = (drawContext.height / 2 - drawContext.transform.y) / drawContext.transform.scale;
        return this.flyTo(centerX, centerY, scale);
      }

      const { width, height } = drawContext;
      applyZoom(scale / drawContext.transform.scale, width / 2, height / 2);
    },

    /**
     * Pan by a delta
     */
    pan(dx, dy) {
      applyPan(dx, dy);
    },

    /**
     * Animate camera to a specific position
     */
    flyTo(sceneX, sceneY, scale, duration = 300) {
      return new Promise((resolve) => {
        kineticAnimation.stop();
        cancelFlyTo();

        flyToResolve = resolve;

        const startX = drawContext.transform.x;
        const startY = drawContext.transform.y;
        const startScale = drawContext.transform.scale;

        const targetScale = Math.max(minZoom, Math.min(maxZoom, scale));

        // Calculate target translation to center the point
        const { width, height } = drawContext;
        const targetX = width / 2 - sceneX * targetScale;
        const targetY = height / 2 - sceneY * targetScale;

        const startTime = performance.now();

        function animate() {
          const now = performance.now();
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // Ease out cubic
          const t = 1 - Math.pow(1 - progress, 3);

          const currentX = startX + (targetX - startX) * t;
          const currentY = startY + (targetY - startY) * t;
          const currentScale = startScale + (targetScale - startScale) * t;

          drawContext.setTransform(currentScale, currentX, currentY);
          onTransform();

          if (progress < 1) {
            flyToRafId = requestAnimationFrame(animate);
          } else {
            flyToRafId = null;
            flyToResolve = null;
            resolve();
          }
        }

        flyToRafId = requestAnimationFrame(animate);
      });
    },

    /**
     * Stop any ongoing animation
     */
    stop() {
      kineticAnimation.stop();
      cancelFlyTo();
    },

    /**
     * Dispose of the pan/zoom controller
     */
    dispose() {
      cancelFlyTo();
      if (mouseController) {
        mouseController.dispose();
        mouseController = null;
      }
      if (touchController) {
        touchController.dispose();
        touchController = null;
      }
      if (kineticAnimation) {
        kineticAnimation.dispose();
        kineticAnimation = null;
      }
    }
  };
}
