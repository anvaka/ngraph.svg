/**
 * ForceLayoutAdapter wraps ngraph.forcelayout for use with ngraph.svg.
 * Provides animation loop integration and position updates.
 *
 * Supports size-aware layout: when getNodeSize is provided (or node sizes
 * are stored in graph.getNode(id).data.size), the layout will automatically:
 * - Increase mass for larger nodes (stronger repulsion)
 * - Enforce minimum spring lengths based on node radii
 *
 * Supports layered orchestration (enabled by default): peels degree-1 leaves
 * to find the structural core, lays out core first, then unpins layers outward,
 * finishing with stress refinement on stretched edges.
 */
import { computeLayers } from './computeLayers.js';
import { computeStressedNodes } from './computeStressedNodes.js';

// Phase constants
const PHASE_CORE_LAYOUT = 'CORE_LAYOUT';
const PHASE_LAYER_SETTLE = 'LAYER_SETTLE';
const PHASE_STRESS_DETECT = 'STRESS_DETECT';
const PHASE_STRESS_REFINE = 'STRESS_REFINE';
const PHASE_DONE = 'DONE';

export default class ForceLayoutAdapter {
  constructor(graph, options = {}) {
    this._graph = graph;
    this._options = options;
    this._layout = null;
    this._running = false;
    this._rafId = null;
    this._onUpdate = null;
    this._nodePositions = new Map();

    // Position smoothing: visual positions interpolate toward physics positions.
    // Lower values = smoother/gentler movement, 1 = no smoothing (raw physics).
    // At 60fps with smoothing=0.15, nodes cover ~90% of the remaining distance
    // in ~330ms — responsive but not jumpy.
    this._smoothing = options.smoothing ?? 0.15;
    // Max displacement per frame (world units). Prevents explosive jumps when
    // strong repulsive forces kick in (e.g. overlapping nodes).
    this._maxSpeed = options.maxSpeed ?? 50;
    this._lastFrameTime = 0;

    // Layout stability detection
    this._energyThreshold = options.energyThreshold ?? 0.003;
    this._onStabilized = options.onStabilized || null;
    this._stabilized = false;
    this._stabilizedFired = false; // guard against double-fire of onStabilized
    this._stableFrameCount = 0;
    this._stableFramesRequired = options.stableFramesRequired ?? 10; // Require multiple stable frames to confirm

    // Layered orchestration options
    this._layeredLayout = options.layeredLayout ?? true;
    this._stressThreshold = options.stressThreshold ?? 0.3;
    this._maxStressIterations = options.maxStressIterations ?? 200;

    // Orchestration state (initialized in _initOrchestration)
    this._phase = null;
    this._layerMap = null;
    this._maxLayer = 0;
    this._currentSettleLayer = 0;
    this._stressPassCount = 0;
    this._stressIterCount = 0;
    this._graphChangeListener = null;
    this._hiddenNodes = new Set(); // nodes not yet revealed to the UI

    // Import and initialize layout lazily
    this._initPromise = this._initLayout(options);

    // Always listen for graph changes to restart layout when nodes/links are added.
    // Without this, the layout can converge on a partially-loaded graph and never
    // process nodes added later (e.g. npm dependency resolution is incremental).
    this._graphGrowthListener = (changes) => {
      if (!this._layout) return;
      let hasNewNodes = false;
      for (let i = 0; i < changes.length; i++) {
        if (changes[i].changeType === 'add' && (changes[i].node || changes[i].link)) {
          hasNewNodes = true;
          break;
        }
      }
      if (hasNewNodes && this._stabilized && !this._running) {
        this._stabilized = false;
        this._stabilizedFired = false;
        this._stableFrameCount = 0;
        this.start();
      } else if (hasNewNodes && !this._stabilized) {
        // Reset stable frame counter so we don't converge prematurely
        this._stableFrameCount = 0;
      }
    };
    this._graph.on('changed', this._graphGrowthListener);
  }

  /**
   * Initialize the force layout
   */
  async _initLayout(options) {
    // Dynamic import to handle the dependency
    const createLayout = (await import('ngraph.forcelayout')).default;

    const graph = this._graph;

    // Node size accessor - use provided function or default to graph node data
    const defaultNodeSize = 10;
    const getNodeSize = options.getNodeSize || ((nodeId) => {
      const node = graph.getNode(nodeId);
      return node?.data?.size || defaultNodeSize;
    });

    // Store for use in other methods
    this._getNodeSize = getNodeSize;

    // Padding between nodes beyond their sizes (in world units)
    const nodePadding = options.nodePadding ?? 4;

    // Base spring length
    const baseSpringLength = options.springLength || 30;

    // Custom mass function: larger nodes get more mass for stronger repulsion
    const nodeMass = (nodeId) => {
      const links = graph.getLinks(nodeId);
      const linkCount = links ? (links.size ?? links.length ?? 0) : 0;
      const size = getNodeSize(nodeId);
      // Base mass from connections + bonus from size
      return 1 + linkCount / 3 + size * 0.1;
    };

    // Spring transform to enforce minimum distance based on node sizes
    const springTransform = (link, spring) => {
      const fromSize = getNodeSize(link.fromId);
      const toSize = getNodeSize(link.toId);
      // Minimum distance is sum of sizes (as radii) plus padding
      const minDist = (fromSize + toSize) / 2 + nodePadding;
      // Spring length should be at least the minimum distance
      spring.length = Math.max(baseSpringLength, minDist);
    };

    // Build final options, ensuring our size-aware functions aren't overwritten
    // unless explicitly provided by user
    const finalOptions = {
      springLength: baseSpringLength,
      springCoefficient: options.springCoefficient || 0.0008,
      dragCoefficient: options.dragCoefficient || 0.04,
      gravity: options.gravity || -2.0,
      theta: options.theta || 0.8,
      timeStep: options.timeStep || 20,
      ...options,
      // These must come after ...options to ensure size-awareness works
      // unless user explicitly passes their own functions
      nodeMass: options.nodeMass || nodeMass,
      springTransform: options.springTransform || springTransform,
    };

    this._layout = createLayout(graph, finalOptions);

    return this._layout;
  }

  /**
   * Get the layout instance (wait for initialization if needed)
   */
  async getLayout() {
    await this._initPromise;
    return this._layout;
  }

  /**
   * Set callback for position updates
   */
  onUpdate(callback) {
    this._onUpdate = callback;
    return this;
  }

  /**
   * Start the layout animation
   */
  async start() {
    await this._initPromise;

    if (this._running) return;
    this._running = true;
    this._stabilized = false;
    this._stabilizedFired = false;
    this._stableFrameCount = 0;
    this._lastFrameTime = 0;

    // Only initialize orchestration on first start; subsequent start()
    // calls (e.g. resume after pause) continue from current phase.
    // Graph changes trigger _onGraphChanged() which re-inits separately.
    if (this._layeredLayout && this._phase === null) {
      this._initOrchestration();
    }

    const animate = (currentTime) => {
      if (!this._running) return;

      // Frame-rate independent smoothing
      const dt = this._lastFrameTime ? (currentTime - this._lastFrameTime) : 16.67;
      this._lastFrameTime = currentTime;

      // Perform layout iteration
      this._layout.step();

      // Update smoothed visual positions
      this._updateSmoothedPositions(dt);

      // Use layered convergence only while orchestration is actively
      // stepping through phases. Once DONE (or when layered is off),
      // fall through to the original total-energy convergence so that
      // pause/resume still terminates properly.
      if (this._layeredLayout && this._phase !== null && this._phase !== PHASE_DONE) {
        // Layered orchestration convergence
        if (!this._stabilized) {
          if (this._checkPhaseConvergence()) {
            this._stableFrameCount++;
            if (this._stableFrameCount >= this._stableFramesRequired) {
              const shouldContinue = this._advancePhase();
              this._stableFrameCount = 0;
              if (!shouldContinue) {
                // All phases complete
                this._stabilized = true;
                this._updatePositions();
                if (this._onUpdate) this._onUpdate(this._nodePositions);
                this.stop();
                if (this._onStabilized && !this._stabilizedFired) {
                  this._stabilizedFired = true;
                  this._onStabilized();
                }
                return;
              }
            }
          } else {
            this._stableFrameCount = 0;
          }
        }

        // Cap stress refinement iterations
        if (this._phase === PHASE_STRESS_REFINE) {
          this._stressIterCount++;
          if (this._stressIterCount >= this._maxStressIterations) {
            this._unpinAll();
            this._phase = PHASE_STRESS_DETECT;
            this._stableFrameCount = 0;
          }
        }
      } else {
        // Original convergence logic (also used after layered DONE)
        if (!this._stabilized && this._checkConvergence()) {
          this._stableFrameCount++;
          if (this._stableFrameCount >= this._stableFramesRequired) {
            this._stabilized = true;
            this._updatePositions();
            if (this._onUpdate) this._onUpdate(this._nodePositions);
            this.stop();
            if (this._onStabilized && !this._stabilizedFired) {
              this._stabilizedFired = true;
              this._onStabilized();
            }
            return;
          }
        } else if (!this._stabilized) {
          this._stableFrameCount = 0;
        }
      }

      // Notify listener
      if (this._onUpdate) {
        this._onUpdate(this._nodePositions);
      }

      this._rafId = requestAnimationFrame(animate);
    };

    this._rafId = requestAnimationFrame(animate);
    return this;
  }

  /**
   * Stop the layout animation
   */
  stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    return this;
  }

  /**
   * Run a single layout step
   */
  async step() {
    await this._initPromise;
    this._layout.step();
    this._updatePositions();
    return this._nodePositions;
  }

  /**
   * Run layout until stable
   */
  async stabilize(maxIterations = 100) {
    await this._initPromise;

    for (let i = 0; i < maxIterations; i++) {
      this._layout.step();
      if (this._checkConvergence()) break;
    }

    this._updatePositions();
    return this._nodePositions;
  }

  /**
   * Get the position of a node
   */
  async getNodePosition(nodeId) {
    await this._initPromise;
    return this._layout.getNodePosition(nodeId);
  }

  /**
   * Set the position of a node (pin it)
   */
  async setNodePosition(nodeId, x, y) {
    await this._initPromise;
    const pos = this._layout.getNodePosition(nodeId);
    pos.x = x;
    pos.y = y;
    return this;
  }

  /**
   * Pin a node at its current position
   */
  async pinNode(nodeId) {
    await this._initPromise;
    const body = this._layout.getBody(nodeId);
    if (body) {
      body.isPinned = true;
    }
    return this;
  }

  /**
   * Unpin a node
   */
  async unpinNode(nodeId) {
    await this._initPromise;
    const body = this._layout.getBody(nodeId);
    if (body) {
      body.isPinned = false;
    }
    return this;
  }

  /**
   * Check if the layout is running
   */
  isRunning() {
    return this._running;
  }

  /**
   * Get all current positions
   */
  getPositions() {
    return this._nodePositions;
  }

  /**
   * Get the bounding box of all nodes
   */
  async getBounds() {
    await this._initPromise;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    this._graph.forEachNode((node) => {
      // Skip nodes hidden by layered orchestration — they don't have
      // meaningful positions yet and would skew the bounding box.
      if (this._hiddenNodes.has(node.id)) return;

      const pos = this._layout.getNodePosition(node.id);
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    });

    // Guard against empty or single-point bounds
    if (minX > maxX) {
      return { left: -100, top: -100, right: 100, bottom: 100, width: 200, height: 200 };
    }
    const width = maxX - minX;
    const height = maxY - minY;
    // Ensure minimum bounds so fitToView doesn't produce extreme zoom
    if (width < 1 || height < 1) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return { left: cx - 50, top: cy - 50, right: cx + 50, bottom: cy + 50, width: 100, height: 100 };
    }

    return { left: minX, top: minY, right: maxX, bottom: maxY, width, height };
  }

  /**
   * Dispose of the adapter
   */
  dispose() {
    this.stop();
    if (this._graphChangeListener && this._graph) {
      this._graph.off('changed', this._graphChangeListener);
      this._graphChangeListener = null;
    }
    if (this._graphGrowthListener && this._graph) {
      this._graph.off('changed', this._graphGrowthListener);
      this._graphGrowthListener = null;
    }
    this._layout = null;
    this._graph = null;
    this._nodePositions.clear();
    this._onUpdate = null;
  }

  /**
   * Check if layout has converged by measuring total kinetic energy
   * @returns {boolean} True if energy is below threshold
   */
  _checkConvergence() {
    if (!this._layout) return false;

    let energy = 0;
    this._graph.forEachNode((node) => {
      const body = this._layout.getBody(node.id);
      if (body && body.velocity) {
        energy += body.velocity.x * body.velocity.x +
                  body.velocity.y * body.velocity.y;
      }
    });

    return energy < this._energyThreshold;
  }

  /**
   * Check if the layout has stabilized
   */
  isStabilized() {
    return this._stabilized;
  }

  /**
   * Get the current kinetic energy of the system
   */
  async getEnergy() {
    await this._initPromise;

    let energy = 0;
    this._graph.forEachNode((node) => {
      const body = this._layout.getBody(node.id);
      if (body && body.velocity) {
        energy += body.velocity.x * body.velocity.x +
                  body.velocity.y * body.velocity.y;
      }
    });

    return energy;
  }

  // ── Layered orchestration ───────────────────────────────────────────

  /**
   * Compute layers, pin non-core nodes, set initial phase, add graph
   * change listener.
   */
  _initOrchestration() {
    const { layerMap, maxLayer } = computeLayers(this._graph);
    this._layerMap = layerMap;
    this._maxLayer = maxLayer;
    this._stressPassCount = 0;
    this._stressIterCount = 0;

    // Pin every node, then unpin only core (maxLayer) nodes
    this._pinAll();
    this._hiddenNodes.clear();
    this._graph.forEachNode((node) => {
      if (layerMap.get(node.id) === maxLayer) {
        const body = this._layout.getBody(node.id);
        if (body) body.isPinned = false;
      } else {
        // Hide non-core nodes from the UI until their layer is unpinned
        this._hiddenNodes.add(node.id);
        this._nodePositions.delete(node.id);
      }
    });

    // If the entire graph is one layer (no peeling happened), skip
    // straight to stress detection — nothing to hide
    if (maxLayer === 0) {
      this._unpinAll();
      this._hiddenNodes.clear();
      this._phase = PHASE_STRESS_DETECT;
    } else {
      this._phase = PHASE_CORE_LAYOUT;
      this._currentSettleLayer = maxLayer - 1; // next layer to unpin
    }

    // React to graph mutations
    if (!this._graphChangeListener) {
      this._graphChangeListener = () => this._onGraphChanged();
      this._graph.on('changed', this._graphChangeListener);
    }
  }

  /**
   * Per-node max energy among unpinned nodes. More sensitive than total
   * energy for detecting bridge nodes still in motion.
   */
  _checkPhaseConvergence() {
    if (!this._layout) return false;

    let maxEnergy = 0;
    this._graph.forEachNode((node) => {
      const body = this._layout.getBody(node.id);
      if (!body || body.isPinned) return;
      if (body.velocity) {
        const e = body.velocity.x * body.velocity.x +
                  body.velocity.y * body.velocity.y;
        if (e > maxEnergy) maxEnergy = e;
      }
    });

    return maxEnergy < this._energyThreshold;
  }

  /**
   * State machine transitions. Returns true if layout should continue
   * animating, false if all phases are complete.
   */
  _advancePhase() {
    switch (this._phase) {
      case PHASE_CORE_LAYOUT:
        // Unpin the next layer outward
        this._unpinLayer(this._currentSettleLayer);
        this._phase = PHASE_LAYER_SETTLE;
        return true;

      case PHASE_LAYER_SETTLE:
        if (this._currentSettleLayer > 0) {
          this._currentSettleLayer--;
          this._unpinLayer(this._currentSettleLayer);
          // Stay in LAYER_SETTLE
          return true;
        }
        // All layers are active — move to stress detection
        this._phase = PHASE_STRESS_DETECT;
        return this._advancePhase(); // immediately evaluate stress

      case PHASE_STRESS_DETECT: {
        if (this._stressPassCount >= 3) {
          this._phase = PHASE_DONE;
          return false;
        }
        const stressedNodes = computeStressedNodes(
          this._graph, this._layout, this._stressThreshold
        );
        if (stressedNodes.size === 0) {
          this._phase = PHASE_DONE;
          return false;
        }
        // Pin all, unpin only stressed + neighbors
        this._pinAll();
        for (const id of stressedNodes) {
          const body = this._layout.getBody(id);
          if (body) body.isPinned = false;
        }
        this._stressPassCount++;
        this._stressIterCount = 0;
        this._phase = PHASE_STRESS_REFINE;
        return true;
      }

      case PHASE_STRESS_REFINE:
        // Refinement converged — unpin all and re-detect
        this._unpinAll();
        this._phase = PHASE_STRESS_DETECT;
        return true;

      case PHASE_DONE:
        return false;

      default:
        return false;
    }
  }

  /**
   * Unpin all nodes in the given layer. Position each one near a
   * connected deeper-layer node (anchor) with small jitter so they
   * don't all stack on top of each other. Zero their velocity.
   */
  _unpinLayer(layerIndex) {
    this._graph.forEachNode((node) => {
      if (this._layerMap.get(node.id) !== layerIndex) return;

      const body = this._layout.getBody(node.id);
      if (!body) return;

      // Find an anchor: prefer a connected node in a deeper layer,
      // fall back to any already-unpinned neighbor
      let anchorPos = null;
      this._graph.forEachLinkedNode(node.id, (neighbor) => {
        const nLayer = this._layerMap.get(neighbor.id);
        if (nLayer > layerIndex) {
          anchorPos = this._layout.getNodePosition(neighbor.id);
          return true; // stop iteration (ngraph supports early exit)
        }
      });
      if (!anchorPos) {
        // Fallback: any neighbor that is already unpinned (not hidden)
        this._graph.forEachLinkedNode(node.id, (neighbor) => {
          if (!this._hiddenNodes.has(neighbor.id)) {
            anchorPos = this._layout.getNodePosition(neighbor.id);
            return true;
          }
        });
      }

      if (anchorPos) {
        const pos = this._layout.getNodePosition(node.id);
        const jitter = 5;
        pos.x = anchorPos.x + (Math.random() - 0.5) * jitter;
        pos.y = anchorPos.y + (Math.random() - 0.5) * jitter;
      }

      // Zero velocity so the node doesn't fly off
      if (body.velocity) {
        body.velocity.x = 0;
        body.velocity.y = 0;
      }

      body.isPinned = false;

      // Reveal to UI — next _updateSmoothedPositions will snap it in
      this._hiddenNodes.delete(node.id);
    });
  }

  /**
   * Pin every node in the graph.
   */
  _pinAll() {
    this._graph.forEachNode((node) => {
      const body = this._layout.getBody(node.id);
      if (body) body.isPinned = true;
    });
  }

  /**
   * Unpin every node in the graph.
   */
  _unpinAll() {
    this._graph.forEachNode((node) => {
      const body = this._layout.getBody(node.id);
      if (body) body.isPinned = false;
    });
  }

  /**
   * Graph changed — recompute layers and restart orchestration from the
   * beginning.
   */
  _onGraphChanged() {
    if (!this._layeredLayout || !this._layout) return;

    // Clean up positions for nodes that no longer exist in the graph
    for (const nodeId of this._nodePositions.keys()) {
      if (!this._graph.getNode(nodeId)) {
        this._nodePositions.delete(nodeId);
        this._hiddenNodes.delete(nodeId);
      }
    }

    // If layout is running, restart orchestration; otherwise just mark
    // that it needs re-init on next start().
    if (this._running) {
      this._stabilized = false;
      this._stabilizedFired = false;
      this._stableFrameCount = 0;
      this._initOrchestration();
    }
  }

  // ── Position helpers ─────────────────────────────────────────────────

  /**
   * Update visual positions with smoothing toward physics positions.
   * Frame-rate independent: at 60fps (dt~16.67ms) the smoothing factor
   * is used directly; at other rates it scales via exponential decay.
   */
  _updateSmoothedPositions(dt) {
    const factor = this._smoothing >= 1
      ? 1
      : 1 - Math.pow(1 - this._smoothing, dt / 16.67);
    const maxSpeed = this._maxSpeed;

    this._graph.forEachNode((node) => {
      // Skip nodes hidden by layered orchestration
      if (this._hiddenNodes.has(node.id)) return;

      const target = this._layout.getNodePosition(node.id);
      const current = this._nodePositions.get(node.id);

      if (!current) {
        // First appearance — snap to physics position, no smoothing
        this._nodePositions.set(node.id, { x: target.x, y: target.y });
        return;
      }

      // Interpolate toward physics position
      let dx = (target.x - current.x) * factor;
      let dy = (target.y - current.y) * factor;

      // Clamp maximum displacement per frame
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxSpeed) {
        const scale = maxSpeed / dist;
        dx *= scale;
        dy *= scale;
      }

      current.x += dx;
      current.y += dy;
    });
  }

  /**
   * Update the positions map from layout (raw, no smoothing).
   * Used by step(), stabilize(), and final snap on convergence.
   */
  _updatePositions() {
    this._graph.forEachNode((node) => {
      const pos = this._layout.getNodePosition(node.id);
      const existing = this._nodePositions.get(node.id);
      if (existing) {
        existing.x = pos.x;
        existing.y = pos.y;
      } else {
        this._nodePositions.set(node.id, { x: pos.x, y: pos.y });
      }
    });
  }
}
