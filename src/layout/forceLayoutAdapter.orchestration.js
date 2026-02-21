import { computeLayers } from './computeLayers.js';
import { computeStressedNodes } from './computeStressedNodes.js';
import {
  PHASE_CORE_LAYOUT,
  PHASE_LAYER_SETTLE,
  PHASE_STRESS_DETECT,
  PHASE_STRESS_REFINE,
  PHASE_DONE,
} from './forceLayoutAdapter.constants.js';

export default {
  _initOrchestration() {
    if (this._isComponentMode()) return;

    const { layerMap, maxLayer } = computeLayers(this._graph);
    this._layerMap = layerMap;
    this._maxLayer = maxLayer;
    this._stressPassCount = 0;
    this._stressIterCount = 0;

    this._pinAll();
    this._hiddenNodes.clear();
    this._graph.forEachNode((node) => {
      if (layerMap.get(node.id) === maxLayer) {
        const body = this._layout.getBody(node.id);
        if (body) body.isPinned = false;
      } else {
        this._hiddenNodes.add(node.id);
        this._nodePositions.delete(node.id);
      }
    });

    if (maxLayer === 0) {
      this._unpinAll();
      this._hiddenNodes.clear();
      this._phase = PHASE_STRESS_DETECT;
    } else {
      this._phase = PHASE_CORE_LAYOUT;
      this._currentSettleLayer = maxLayer - 1;
    }

    if (!this._graphChangeListener) {
      this._graphChangeListener = () => this._onGraphChanged();
      this._graph.on('changed', this._graphChangeListener);
    }
  },

  _checkPhaseConvergence() {
    if (this._isComponentMode()) return this._checkConvergence();
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
  },

  _advancePhase() {
    switch (this._phase) {
      case PHASE_CORE_LAYOUT:
        this._unpinLayer(this._currentSettleLayer);
        this._phase = PHASE_LAYER_SETTLE;
        return true;

      case PHASE_LAYER_SETTLE:
        if (this._currentSettleLayer > 0) {
          this._currentSettleLayer--;
          this._unpinLayer(this._currentSettleLayer);
          return true;
        }
        this._phase = PHASE_STRESS_DETECT;
        return this._advancePhase();

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
        this._unpinAll();
        this._phase = PHASE_STRESS_DETECT;
        return true;

      case PHASE_DONE:
        return false;

      default:
        return false;
    }
  },

  _unpinLayer(layerIndex) {
    let cx = 0;
    let cy = 0;
    let visibleCount = 0;
    let maxDist = 0;

    this._graph.forEachNode((node) => {
      if (this._hiddenNodes.has(node.id)) return;
      const pos = this._layout.getNodePosition(node.id);
      cx += pos.x;
      cy += pos.y;
      visibleCount++;
    });

    if (visibleCount > 0) {
      cx /= visibleCount;
      cy /= visibleCount;
      this._graph.forEachNode((node) => {
        if (this._hiddenNodes.has(node.id)) return;
        const pos = this._layout.getNodePosition(node.id);
        const d = Math.hypot(pos.x - cx, pos.y - cy);
        if (d > maxDist) maxDist = d;
      });
    }

    const fallbackRadius = maxDist + 20;

    this._graph.forEachNode((node) => {
      if (this._layerMap.get(node.id) !== layerIndex) return;

      const body = this._layout.getBody(node.id);
      if (!body) return;

      let anchorPos = null;
      this._graph.forEachLinkedNode(node.id, (neighbor) => {
        const nLayer = this._layerMap.get(neighbor.id);
        if (nLayer > layerIndex) {
          anchorPos = this._layout.getNodePosition(neighbor.id);
          return true;
        }
      });

      if (!anchorPos) {
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
      } else if (visibleCount > 0) {
        const angle = Math.random() * Math.PI * 2;
        const pos = this._layout.getNodePosition(node.id);
        pos.x = cx + Math.cos(angle) * fallbackRadius;
        pos.y = cy + Math.sin(angle) * fallbackRadius;
      }

      if (body.velocity) {
        body.velocity.x = 0;
        body.velocity.y = 0;
      }

      body.isPinned = false;
      this._hiddenNodes.delete(node.id);
    });
  },

  _pinAll() {
    if (this._isComponentMode()) {
      for (let i = 0; i < this._componentContexts.length; ++i) {
        const context = this._componentContexts[i];
        if (!context.layout) continue;
        for (let n = 0; n < context.nodes.length; ++n) {
          const body = context.layout.getBody(context.nodes[n]);
          if (body) body.isPinned = true;
        }
      }
      return;
    }

    this._graph.forEachNode((node) => {
      const body = this._layout.getBody(node.id);
      if (body) body.isPinned = true;
    });
  },

  _unpinAll() {
    if (this._isComponentMode()) {
      for (let i = 0; i < this._componentContexts.length; ++i) {
        const context = this._componentContexts[i];
        if (!context.layout) continue;
        for (let n = 0; n < context.nodes.length; ++n) {
          const body = context.layout.getBody(context.nodes[n]);
          if (body) body.isPinned = false;
        }
      }
      return;
    }

    this._graph.forEachNode((node) => {
      const body = this._layout.getBody(node.id);
      if (body) body.isPinned = false;
    });
  },

  _onGraphChanged() {
    if (this._isComponentMode()) {
      this._stabilized = false;
      this._stabilizedFired = false;
      this._stableFrameCount = 0;
      this._componentPacked = false;
      this._componentFrameCounter = 0;
      this._phase = null;
      this._initPromise = this._initLayout(this._options);
      return;
    }

    if (!this._layeredLayout || !this._layout) return;

    for (const nodeId of this._nodePositions.keys()) {
      if (!this._graph.getNode(nodeId)) {
        this._nodePositions.delete(nodeId);
        this._hiddenNodes.delete(nodeId);
      }
    }

    if (this._running) {
      this._stabilized = false;
      this._stabilizedFired = false;
      this._stableFrameCount = 0;
      this._initOrchestration();
    }
  },
};
