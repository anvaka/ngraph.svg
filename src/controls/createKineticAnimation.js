/**
 * Kinetic animation for smooth momentum-based scrolling.
 * Tracks velocity during pan and continues movement after release.
 */
export default function createKineticAnimation(options = {}) {
  const {
    friction = 0.92,
    minVelocity = 0.5,
    onUpdate = () => {}
  } = options;

  let velocityX = 0;
  let velocityY = 0;
  let lastTime = 0;
  let rafId = null;
  let isTracking = false;

  // Track recent movements for velocity calculation
  const movements = [];
  const maxMovements = 5;

  function recordMovement(dx, dy) {
    const now = performance.now();
    movements.push({ dx, dy, time: now });

    // Keep only recent movements
    while (movements.length > maxMovements) {
      movements.shift();
    }
  }

  function calculateVelocity() {
    if (movements.length < 2) {
      return { vx: 0, vy: 0 };
    }

    // Calculate average velocity from recent movements
    let totalDx = 0;
    let totalDy = 0;
    let totalTime = 0;

    for (let i = 1; i < movements.length; i++) {
      const dt = movements[i].time - movements[i - 1].time;
      if (dt > 0) {
        totalDx += movements[i].dx;
        totalDy += movements[i].dy;
        totalTime += dt;
      }
    }

    if (totalTime === 0) {
      return { vx: 0, vy: 0 };
    }

    // Velocity in pixels per millisecond
    return {
      vx: (totalDx / totalTime) * 16, // Scale to approx per-frame velocity
      vy: (totalDy / totalTime) * 16
    };
  }

  function animate() {
    rafId = null;

    const now = performance.now();
    const dt = Math.min(now - lastTime, 32); // Cap at ~30fps minimum
    lastTime = now;

    // Frame-rate independent friction and movement
    const dtScale = dt / 16;
    const frictionFactor = Math.pow(friction, dtScale);
    velocityX *= frictionFactor;
    velocityY *= frictionFactor;

    // Stop if velocity is too low
    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
    if (speed < minVelocity) {
      velocityX = 0;
      velocityY = 0;
      return;
    }

    // Apply movement scaled by time
    onUpdate(velocityX * dtScale, velocityY * dtScale);

    // Continue animation
    rafId = requestAnimationFrame(animate);
  }

  return {
    /**
     * Start tracking movements
     */
    startTracking() {
      isTracking = true;
      movements.length = 0;
      this.stop();
    },

    /**
     * Record a movement during pan
     */
    track(dx, dy) {
      if (isTracking) {
        recordMovement(dx, dy);
      }
    },

    /**
     * Stop tracking and start kinetic animation
     */
    release() {
      isTracking = false;

      const { vx, vy } = calculateVelocity();
      velocityX = vx;
      velocityY = vy;
      movements.length = 0;

      // Start animation if there's enough velocity
      const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
      if (speed >= minVelocity) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(animate);
      }
    },

    /**
     * Stop any ongoing animation
     */
    stop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      velocityX = 0;
      velocityY = 0;
    },

    /**
     * Check if animation is running
     */
    isAnimating() {
      return rafId !== null;
    },

    /**
     * Dispose of the animation
     */
    dispose() {
      this.stop();
      movements.length = 0;
    }
  };
}
