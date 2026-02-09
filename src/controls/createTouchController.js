/**
 * Touch controller for pan/zoom interactions.
 * Handles single touch for panning and pinch gestures for zooming.
 * Based on patterns from w-gl for robust touch handling.
 */

class TouchState {
  constructor(touch) {
    this.id = touch.identifier;
    this.x = touch.clientX;
    this.y = touch.clientY;
    this.lastX = this.x;
    this.lastY = this.y;
  }

  move(touch) {
    this.lastX = this.x;
    this.lastY = this.y;
    this.x = touch.clientX;
    this.y = touch.clientY;
  }
}

export default function createTouchController(element, callbacks) {
  const { onPanStart, onPanMove, onPanEnd, onZoom } = callbacks;

  let activeTouches = new Map();
  let listening = false;
  let lastTouchEndTime = 0;
  let lastMultiTouchTime = 0;
  let lastTapTouch = null;

  // Attach initial listener
  element.addEventListener('touchstart', handleTouchStart, { passive: false });

  function handleTouchStart(e) {
    if (!listening) {
      startDocumentListeners();
      listening = true;
    }

    // Track all touches
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (!activeTouches.has(touch.identifier)) {
        activeTouches.set(touch.identifier, new TouchState(touch));
      }
    }

    // Start panning if single touch
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      onPanStart && onPanStart({ x: touch.clientX, y: touch.clientY, event: e });
    }

    e.preventDefault();
    e.stopPropagation();
  }

  function handleTouchMove(e) {
    const now = Date.now();
    let dx = 0;
    let dy = 0;
    let cx = 0;
    let cy = 0;
    let first = null;
    let second = null;

    // Update all tracked touches
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      const state = activeTouches.get(touch.identifier);
      if (!state) continue;

      state.move(touch);

      cx += state.x;
      cy += state.y;
      dx += state.x - state.lastX;
      dy += state.y - state.lastY;

      if (!first) first = state;
      else if (!second) second = state;
    }

    const count = e.touches.length;
    if (count === 0) return;

    dx /= count;
    dy /= count;
    cx /= count;
    cy /= count;

    // Handle pinch zoom
    if (first && second) {
      lastMultiTouchTime = now;

      const currentDist = Math.hypot(second.x - first.x, second.y - first.y);
      const lastDist = Math.hypot(second.lastX - first.lastX, second.lastY - first.lastY);

      if (lastDist > 0) {
        const factor = currentDist / lastDist;

        // Get center relative to element
        const rect = element.getBoundingClientRect();
        const x = cx - rect.left;
        const y = cy - rect.top;

        onZoom && onZoom({ factor, x, y, event: e });
      }

      e.preventDefault();
      e.stopPropagation();
    }

    // Handle panning
    // Skip panning briefly after multi-touch to avoid jumps
    const timeSinceMultiTouch = now - lastMultiTouchTime;
    const shouldPan = e.touches.length === 1 && timeSinceMultiTouch > 100;

    if (shouldPan && (dx !== 0 || dy !== 0)) {
      onPanMove && onPanMove({ dx, dy, x: cx, y: cy, event: e });
    }
  }

  function handleTouchEnd(e) {
    const now = Date.now();
    const timeSinceLastEnd = now - lastTouchEndTime;
    lastTouchEndTime = now;

    // Remove ended touches
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      activeTouches.delete(touch.identifier);
    }

    // Clean up if no more touches
    if (e.touches.length === 0) {
      activeTouches.clear();
      listening = false;
      stopDocumentListeners();

      // Check for double-tap
      if (e.changedTouches.length === 1 && now - lastMultiTouchTime > 350) {
        const touch = e.changedTouches[0];

        if (timeSinceLastEnd < 350 && lastTapTouch) {
          const tapDist = Math.hypot(
            touch.clientX - lastTapTouch.clientX,
            touch.clientY - lastTapTouch.clientY
          );

          if (tapDist < 30) {
            // Double tap - zoom in
            const rect = element.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            onZoom && onZoom({ factor: 2, x, y, event: e });
          }
        }

        lastTapTouch = { clientX: touch.clientX, clientY: touch.clientY };
      }

      onPanEnd && onPanEnd({ x: 0, y: 0, event: e });
    }
  }

  function startDocumentListeners() {
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: false });
  }

  function stopDocumentListeners() {
    document.removeEventListener('touchmove', handleTouchMove, { passive: false });
    document.removeEventListener('touchend', handleTouchEnd, { passive: false });
    document.removeEventListener('touchcancel', handleTouchEnd, { passive: false });
  }

  return {
    dispose() {
      element.removeEventListener('touchstart', handleTouchStart, { passive: false });
      stopDocumentListeners();
      activeTouches.clear();
    }
  };
}
