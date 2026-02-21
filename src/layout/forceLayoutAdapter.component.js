import { packComponents } from './packComponents.js';

export default {
  _isComponentMode() {
    return this._componentContexts.length > 0;
  },

  _createComponentLayoutProxy() {
    const adapter = this;
    return {
      step() {
        adapter._stepComponentLayouts();
        return true;
      },
      getNodePosition(nodeId) {
        adapter._readNodeTargetPosition(nodeId, adapter._scratchPosition);
        return { x: adapter._scratchPosition.x, y: adapter._scratchPosition.y };
      },
      getBody(nodeId) {
        const context = adapter._nodeToComponentContext.get(nodeId);
        if (!context || !context.layout) return null;
        return context.layout.getBody(nodeId);
      },
      getSpring(fromId, toId) {
        const fromContext = adapter._nodeToComponentContext.get(fromId);
        const toContext = adapter._nodeToComponentContext.get(toId);
        if (!fromContext || !toContext || fromContext !== toContext || !fromContext.layout) return null;
        return fromContext.layout.getSpring(fromId, toId);
      },
    };
  },

  _stepComponentLayouts() {
    for (let i = 0; i < this._componentContexts.length; ++i) {
      const context = this._componentContexts[i];
      if (!context.layout || context.isSleeping) continue;

      context.layout.step();
      context.boundsDirty = true;

      const energy = this._measureComponentEnergy(context);
      context.lastEnergy = energy;

      if (energy < this._energyThreshold) {
        context.stableFrames += 1;
        if (context.stableFrames >= this._componentStableFramesRequired) {
          context.isSleeping = true;
          context.lastEnergy = 0;
        }
      } else {
        context.stableFrames = 0;
      }
    }
  },

  _measureComponentEnergy(context) {
    let energy = 0;
    const nodes = context.nodes;
    for (let n = 0; n < nodes.length; ++n) {
      const body = context.layout.getBody(nodes[n]);
      if (body && body.velocity) {
        energy += body.velocity.x * body.velocity.x +
                  body.velocity.y * body.velocity.y;
      }
    }
    return energy;
  },

  _packComponentContexts(applyInstantly = false) {
    const contexts = this._componentContexts;
    const packInput = this._componentPackInput;

    if (packInput.length > contexts.length) {
      packInput.length = contexts.length;
    }

    for (let i = 0; i < contexts.length; ++i) {
      const context = contexts[i];
      if (context.boundsDirty) {
        this._computeComponentBounds(context);
        context.boundsDirty = false;
      }

      let entry = packInput[i];
      if (!entry) {
        entry = { id: i, width: 1, height: 1 };
        packInput[i] = entry;
      }

      entry.id = i;
      entry.width = Math.max(1, context.bounds.width);
      entry.height = Math.max(1, context.bounds.height);
    }

    const offsets = packComponents(packInput, this._componentPackingPadding);
    for (let i = 0; i < contexts.length; ++i) {
      const context = contexts[i];
      const offset = offsets[i];
      context.targetOffsetX = offset.x;
      context.targetOffsetY = offset.y;
      if (applyInstantly) {
        context.offsetX = offset.x;
        context.offsetY = offset.y;
      }
    }
  },

  _updateComponentOffsets(dt) {
    if (!this._isComponentMode()) return;

    const factor = this._componentPackingSmoothing >= 1
      ? 1
      : 1 - Math.pow(1 - this._componentPackingSmoothing, dt / 16.67);

    for (let i = 0; i < this._componentContexts.length; ++i) {
      const context = this._componentContexts[i];
      context.offsetX += (context.targetOffsetX - context.offsetX) * factor;
      context.offsetY += (context.targetOffsetY - context.offsetY) * factor;
    }
  },

  _computeComponentBounds(context) {
    const nodes = context.nodes;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < nodes.length; ++i) {
      const nodeId = nodes[i];
      const pos = context.layout
        ? context.layout.getNodePosition(nodeId)
        : context.motifPositions.get(nodeId);
      const x = pos ? pos.x : 0;
      const y = pos ? pos.y : 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    if (!(minX <= maxX)) {
      context.bounds.left = 0;
      context.bounds.top = 0;
      context.bounds.right = 1;
      context.bounds.bottom = 1;
      context.bounds.width = 1;
      context.bounds.height = 1;
      return;
    }

    context.bounds.left = minX;
    context.bounds.top = minY;
    context.bounds.right = maxX;
    context.bounds.bottom = maxY;
    context.bounds.width = maxX - minX;
    context.bounds.height = maxY - minY;
  },

  _readNodeTargetPosition(nodeId, out) {
    if (this._isComponentMode()) {
      const context = this._nodeToComponentContext.get(nodeId);
      if (!context) {
        out.x = 0;
        out.y = 0;
        return;
      }

      if (context.layout) {
        const pos = context.layout.getNodePosition(nodeId);
        out.x = pos.x + context.offsetX;
        out.y = pos.y + context.offsetY;
      } else {
        const pos = context.motifPositions.get(nodeId);
        out.x = (pos ? pos.x : 0) + context.offsetX;
        out.y = (pos ? pos.y : 0) + context.offsetY;
      }
      return;
    }

    const pos = this._layout.getNodePosition(nodeId);
    out.x = pos.x;
    out.y = pos.y;
  },
};
