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
    const entryToContext = this._componentEntryToContext || (this._componentEntryToContext = []);
    const singleContextIndexes = this._singleContextIndexes || (this._singleContextIndexes = []);
    const singleLocalOffsets = this._singleLocalOffsets || (this._singleLocalOffsets = []);

    entryToContext.length = 0;
    singleContextIndexes.length = 0;
    singleLocalOffsets.length = 0;

    let packCount = 0;

    if (packInput.length > contexts.length) {
      packInput.length = contexts.length;
    }

    for (let i = 0; i < contexts.length; ++i) {
      const context = contexts[i];
      if (context.boundsDirty) {
        this._computeComponentBounds(context);
        context.boundsDirty = false;
      }

      if (context.nodes.length === 1) {
        singleContextIndexes.push(i);
        continue;
      }

      let entry = packInput[packCount];
      if (!entry) {
        entry = { id: packCount, width: 1, height: 1 };
        packInput[packCount] = entry;
      }

      entry.id = packCount;
      entry.width = Math.max(1, context.bounds.width);
      entry.height = Math.max(1, context.bounds.height);
      entryToContext[packCount] = i;
      packCount += 1;
    }

    let singlesEntryIndex = -1;
    if (singleContextIndexes.length > 0) {
      const singleBounds = this._computeSingleClusterLayout(
        contexts,
        singleContextIndexes,
        singleLocalOffsets
      );
      let entry = packInput[packCount];
      if (!entry) {
        entry = { id: packCount, width: 1, height: 1 };
        packInput[packCount] = entry;
      }
      entry.id = packCount;
      entry.width = singleBounds.width;
      entry.height = singleBounds.height;
      singlesEntryIndex = packCount;
      packCount += 1;
    }

    packInput.length = packCount;

    const offsets = packComponents(packInput, this._componentPackingPadding);
    for (let i = 0; i < entryToContext.length; ++i) {
      const context = contexts[entryToContext[i]];
      const offset = offsets[i];
      context.targetOffsetX = offset.x - context.bounds.left;
      context.targetOffsetY = offset.y - context.bounds.top;
      if (applyInstantly) {
        context.offsetX = context.targetOffsetX;
        context.offsetY = context.targetOffsetY;
      }
    }

    if (singlesEntryIndex !== -1) {
      const blockOffset = offsets[singlesEntryIndex];
      for (let i = 0; i < singleContextIndexes.length; ++i) {
        const context = contexts[singleContextIndexes[i]];
        const local = singleLocalOffsets[i];
        context.targetOffsetX = blockOffset.x + local.x - context.bounds.left;
        context.targetOffsetY = blockOffset.y + local.y - context.bounds.top;
        if (applyInstantly) {
          context.offsetX = context.targetOffsetX;
          context.offsetY = context.targetOffsetY;
        }
      }
    }
  },

  _computeSingleClusterLayout(contexts, singleContextIndexes, singleLocalOffsets) {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const items = new Array(singleContextIndexes.length);
    let sizeSum = 0;

    for (let i = 0; i < singleContextIndexes.length; ++i) {
      const contextIndex = singleContextIndexes[i];
      const nodeId = contexts[contextIndex].nodes[0];
      const diameter = Math.max(1, this._getNodeSize(nodeId) || 1);
      items[i] = { contextIndex, diameter };
      sizeSum += diameter;
    }

    items.sort((a, b) => b.diameter - a.diameter);

    const avgSize = sizeSum / Math.max(1, items.length);
    const step = Math.max(8, avgSize * 0.55 + this._componentPackingPadding * 0.12);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const localByContext = new Map();

    for (let i = 0; i < items.length; ++i) {
      const item = items[i];
      const radius = item.diameter * 0.5;
      const spiral = i === 0 ? 0 : step * Math.sqrt(i) + radius;
      const angle = i * goldenAngle;
      const x = Math.cos(angle) * spiral;
      const y = Math.sin(angle) * spiral;

      localByContext.set(item.contextIndex, { x, y });

      const left = x - radius;
      const top = y - radius;
      const right = x + radius;
      const bottom = y + radius;
      if (left < minX) minX = left;
      if (top < minY) minY = top;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }

    const shiftX = minX;
    const shiftY = minY;
    for (let i = 0; i < singleContextIndexes.length; ++i) {
      const contextIndex = singleContextIndexes[i];
      const local = localByContext.get(contextIndex);
      singleLocalOffsets[i] = {
        x: local.x - shiftX,
        y: local.y - shiftY,
      };
    }

    return {
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
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
