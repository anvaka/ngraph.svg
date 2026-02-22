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
import {
  PHASE_STRESS_DETECT,
  PHASE_STRESS_REFINE,
  PHASE_DONE,
} from './forceLayoutAdapter.constants.js';
import initMethods from './forceLayoutAdapter.init.js';
import componentMethods from './forceLayoutAdapter.component.js';
import orchestrationMethods from './forceLayoutAdapter.orchestration.js';
import positionMethods from './forceLayoutAdapter.positions.js';

export default class ForceLayoutAdapter {
  constructor(graph, options = {}) {
    this._graph = graph;
    this._options = options;
    this._layout = null;
    this._running = false;
    this._rafId = null;
    this._onUpdate = null;
    this._nodePositions = new Map();

    this._smoothing = options.smoothing ?? 0.15;
    this._maxSpeed = options.maxSpeed ?? 50;
    this._lastFrameTime = 0;

    this._energyThreshold = options.energyThreshold ?? 0.003;
    this._onStabilized = options.onStabilized || null;
    this._stabilized = false;
    this._stabilizedFired = false;
    this._stableFrameCount = 0;
    this._stableFramesRequired = options.stableFramesRequired ?? 10;
    this._componentStableFramesRequired = options.componentStableFramesRequired ?? this._stableFramesRequired;

    this._layeredLayout = options.layeredLayout ?? true;
    this._stressThreshold = options.stressThreshold ?? 0.3;
    this._maxStressIterations = options.maxStressIterations ?? 200;

    this._componentLayout = options.componentLayout ?? true;
    this._motifLayout = options.motifLayout ?? true;
    this._motifMaxSize = options.motifMaxSize ?? 64;
    this._componentPackingPadding = options.componentPackingPadding ?? 80;
    this._componentPackingSmoothing = options.componentPackingSmoothing ?? 0.16;
    this._componentRepackInterval = options.componentRepackInterval ?? 12;
    this._componentContexts = [];
    this._componentPackInput = [];
    this._nodeToComponentContext = new Map();
    this._componentLayoutProxy = null;
    this._componentPacked = false;
    this._componentFrameCounter = 0;

    this._phase = null;
    this._layerMap = null;
    this._maxLayer = 0;
    this._currentSettleLayer = 0;
    this._stressPassCount = 0;
    this._stressIterCount = 0;
    this._graphChangeListener = null;
    this._hiddenNodes = new Set();
    this._scratchPosition = { x: 0, y: 0 };

    this._initPromise = this._initLayout(options);

    this._graphGrowthListener = (changes) => {
      let hasNewNodes = false;
      let hasStructuralChanges = false;
      let hasPotentialNewComponent = false;
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        if (change.node || change.link) {
          hasStructuralChanges = true;
        }
        if (change.changeType === 'add' && (change.node || change.link)) {
          hasNewNodes = true;
        }
        if (change.changeType === 'add' && change.node) {
          const links = this._graph.getLinks(change.node.id);
          const linkCount = links ? (links.size ?? links.length ?? 0) : 0;
          if (linkCount === 0) {
            hasPotentialNewComponent = true;
          }
        }
      }

      const needsComponentReinit = this._componentLayout && (
        this._isComponentMode() || hasPotentialNewComponent
      );

      if (hasStructuralChanges && needsComponentReinit) {
        this._phase = null;
        this._componentPacked = false;
        this._initPromise = this._initLayout(this._options);
      }
      if (hasNewNodes && this._stabilized && !this._running) {
        this._stabilized = false;
        this._stabilizedFired = false;
        this._stableFrameCount = 0;
        this.start();
      } else if (hasNewNodes && !this._stabilized) {
        this._stableFrameCount = 0;
      }
    };
    this._graph.on('changed', this._graphGrowthListener);
  }

  async getLayout() {
    await this._initPromise;
    return this._isComponentMode() ? this._componentLayoutProxy : this._layout;
  }

  onUpdate(callback) {
    this._onUpdate = callback;
    return this;
  }

  async start() {
    await this._initPromise;

    if (this._running) return;
    this._running = true;
    this._stabilized = false;
    this._stabilizedFired = false;
    this._stableFrameCount = 0;
    this._lastFrameTime = 0;

    if (!this._isComponentMode() && this._layeredLayout && this._phase === null) {
      this._initOrchestration();
    }

    const animate = (currentTime) => {
      if (!this._running) return;

      const dt = this._lastFrameTime ? (currentTime - this._lastFrameTime) : 16.67;
      this._lastFrameTime = currentTime;

      if (this._isComponentMode()) {
        this._stepComponentLayouts();
        this._componentFrameCounter++;
        if (this._componentFrameCounter % this._componentRepackInterval === 0) {
          this._packComponentContexts(false);
        }
      } else {
        this._layout.step();
      }

      if (this._isComponentMode()) {
        this._updateComponentOffsets(dt);
      }

      this._updateSmoothedPositions(dt);

      if (!this._isComponentMode() && this._layeredLayout && this._phase !== null && this._phase !== PHASE_DONE) {
        if (!this._stabilized) {
          if (this._checkPhaseConvergence()) {
            this._stableFrameCount++;
            if (this._stableFrameCount >= this._stableFramesRequired) {
              const shouldContinue = this._advancePhase();
              this._stableFrameCount = 0;
              if (!shouldContinue) {
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

        if (this._phase === PHASE_STRESS_REFINE) {
          this._stressIterCount++;
          if (this._stressIterCount >= this._maxStressIterations) {
            this._unpinAll();
            this._phase = PHASE_STRESS_DETECT;
            this._stableFrameCount = 0;
          }
        }
      } else {
        if (!this._stabilized && this._checkConvergence()) {
          this._stableFrameCount++;
          if (this._stableFrameCount >= this._stableFramesRequired) {
            if (this._isComponentMode() && !this._componentPacked) {
              this._packComponentContexts(true);
              this._componentPacked = true;
            }
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

      if (this._onUpdate) {
        this._onUpdate(this._nodePositions);
      }

      this._rafId = requestAnimationFrame(animate);
    };

    this._rafId = requestAnimationFrame(animate);
    return this;
  }

  stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    return this;
  }

  async step() {
    await this._initPromise;
    if (this._isComponentMode()) {
      this._stepComponentLayouts();
      this._componentFrameCounter++;
      if (this._componentFrameCounter % this._componentRepackInterval === 0) {
        this._packComponentContexts(false);
      }
      this._updateComponentOffsets(16.67);
    } else {
      this._layout.step();
    }
    this._updatePositions();
    return this._nodePositions;
  }

  async stabilize(maxIterations = 100) {
    await this._initPromise;

    for (let i = 0; i < maxIterations; i++) {
      if (this._isComponentMode()) {
        this._stepComponentLayouts();
        this._componentFrameCounter++;
        if (this._componentFrameCounter % this._componentRepackInterval === 0) {
          this._packComponentContexts(false);
        }
        this._updateComponentOffsets(16.67);
      } else {
        this._layout.step();
      }
      if (this._checkConvergence()) break;
    }

    if (this._isComponentMode() && !this._componentPacked) {
      this._packComponentContexts(true);
      this._componentPacked = true;
    }

    this._updatePositions();
    return this._nodePositions;
  }

  async getNodePosition(nodeId) {
    await this._initPromise;
    this._readNodeTargetPosition(nodeId, this._scratchPosition);
    return { x: this._scratchPosition.x, y: this._scratchPosition.y };
  }

  async setNodePosition(nodeId, x, y) {
    await this._initPromise;
    if (this._isComponentMode()) {
      const context = this._nodeToComponentContext.get(nodeId);
      if (!context) return this;
      if (context.layout) {
        const pos = context.layout.getNodePosition(nodeId);
        pos.x = x - context.offsetX;
        pos.y = y - context.offsetY;
        context.isSleeping = false;
        context.stableFrames = 0;
        context.boundsDirty = true;
      } else {
        const pos = context.motifPositions.get(nodeId);
        if (pos) {
          pos.x = x - context.offsetX;
          pos.y = y - context.offsetY;
          context.boundsDirty = true;
        }
      }
      return this;
    }

    const pos = this._layout.getNodePosition(nodeId);
    pos.x = x;
    pos.y = y;
    return this;
  }

  async pinNode(nodeId) {
    await this._initPromise;
    const body = this._isComponentMode()
      ? this._componentLayoutProxy.getBody(nodeId)
      : this._layout.getBody(nodeId);
    if (body) {
      body.isPinned = true;
    }
    return this;
  }

  async unpinNode(nodeId) {
    await this._initPromise;
    const body = this._isComponentMode()
      ? this._componentLayoutProxy.getBody(nodeId)
      : this._layout.getBody(nodeId);
    if (body) {
      body.isPinned = false;
      if (this._isComponentMode()) {
        const context = this._nodeToComponentContext.get(nodeId);
        if (context && context.layout) {
          context.isSleeping = false;
          context.stableFrames = 0;
        }
      }
    }
    return this;
  }

  isRunning() {
    return this._running;
  }

  getPositions() {
    return this._nodePositions;
  }

  async getBounds() {
    await this._initPromise;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    this._graph.forEachNode((node) => {
      if (this._hiddenNodes.has(node.id)) return;

      this._readNodeTargetPosition(node.id, this._scratchPosition);
      minX = Math.min(minX, this._scratchPosition.x);
      minY = Math.min(minY, this._scratchPosition.y);
      maxX = Math.max(maxX, this._scratchPosition.x);
      maxY = Math.max(maxY, this._scratchPosition.y);
    });

    if (minX > maxX) {
      return { left: -100, top: -100, right: 100, bottom: 100, width: 200, height: 200 };
    }

    const width = maxX - minX;
    const height = maxY - minY;
    if (width < 1 || height < 1) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return { left: cx - 50, top: cy - 50, right: cx + 50, bottom: cy + 50, width: 100, height: 100 };
    }

    return { left: minX, top: minY, right: maxX, bottom: maxY, width, height };
  }

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
    this._componentContexts.length = 0;
    this._componentPackInput.length = 0;
    this._componentLayoutProxy = null;
    this._nodeToComponentContext.clear();
    this._graph = null;
    this._nodePositions.clear();
    this._onUpdate = null;
  }

  isStabilized() {
    return this._stabilized;
  }

  async getEnergy() {
    await this._initPromise;

    if (this._isComponentMode()) {
      let totalEnergy = 0;
      for (let i = 0; i < this._componentContexts.length; ++i) {
        const context = this._componentContexts[i];
        if (!context.layout) continue;
        if (context.isSleeping) continue;
        totalEnergy += context.lastEnergy;
      }
      return totalEnergy;
    }

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
}

Object.assign(
  ForceLayoutAdapter.prototype,
  initMethods,
  componentMethods,
  orchestrationMethods,
  positionMethods,
);
