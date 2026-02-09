/**
 * Mouse controller for pan/zoom interactions.
 * Handles mouse drag for panning and wheel for zooming.
 */
export default function createMouseController(element, callbacks) {
  const { onPanStart, onPanMove, onPanEnd, onZoom } = callbacks;

  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  // Event listener registry for clean disposal
  const listeners = [];

  function addEventListener(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push({ target, event, handler, options });
  }

  function onMouseDown(e) {
    if (e.button !== 0) return; // Only left mouse button

    isPanning = true;
    lastX = e.clientX;
    lastY = e.clientY;

    onPanStart && onPanStart({ x: lastX, y: lastY, event: e });

    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!isPanning) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    onPanMove && onPanMove({ dx, dy, x: lastX, y: lastY, event: e });
  }

  function onMouseUp(e) {
    if (!isPanning) return;

    isPanning = false;
    onPanEnd && onPanEnd({ x: e.clientX, y: e.clientY, event: e });
  }

  function onWheel(e) {
    e.preventDefault();

    // Normalize wheel delta across browsers
    let delta = e.deltaY;
    if (e.deltaMode === 1) {
      // Line mode
      delta *= 40;
    } else if (e.deltaMode === 2) {
      // Page mode
      delta *= 800;
    }

    // Convert to zoom factor (negative delta = zoom in)
    const zoomFactor = 1 - delta * 0.003;

    // Get mouse position relative to element
    const rect = element.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    onZoom && onZoom({ factor: zoomFactor, x, y, event: e });
  }

  function onDoubleClick(e) {
    const rect = element.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Zoom in 2x on double-click
    onZoom && onZoom({ factor: 2, x, y, event: e });
  }

  // Attach event listeners
  addEventListener(element, 'mousedown', onMouseDown);
  addEventListener(window, 'mousemove', onMouseMove);
  addEventListener(window, 'mouseup', onMouseUp);
  addEventListener(element, 'wheel', onWheel, { passive: false });
  addEventListener(element, 'dblclick', onDoubleClick);

  return {
    dispose() {
      for (const { target, event, handler, options } of listeners) {
        target.removeEventListener(event, handler, options);
      }
      listeners.length = 0;
    }
  };
}
