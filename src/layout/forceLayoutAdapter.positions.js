export default {
  _checkConvergence() {
    if (this._isComponentMode()) {
      let totalEnergy = 0;
      let activeDynamicComponents = 0;

      for (let i = 0; i < this._componentContexts.length; ++i) {
        const context = this._componentContexts[i];
        if (!context.layout) continue;
        if (context.isSleeping) continue;

        activeDynamicComponents += 1;
        totalEnergy += context.lastEnergy;
      }

      if (activeDynamicComponents === 0) return true;
      return totalEnergy < this._energyThreshold;
    }

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
  },

  _updateSmoothedPositions(dt) {
    const factor = this._smoothing >= 1
      ? 1
      : 1 - Math.pow(1 - this._smoothing, dt / 16.67);
    const maxSpeed = this._maxSpeed;

    this._graph.forEachNode((node) => {
      if (this._hiddenNodes.has(node.id)) return;

      this._readNodeTargetPosition(node.id, this._scratchPosition);
      const current = this._nodePositions.get(node.id);

      if (!current) {
        this._nodePositions.set(node.id, {
          x: this._scratchPosition.x,
          y: this._scratchPosition.y,
        });
        return;
      }

      let dx = (this._scratchPosition.x - current.x) * factor;
      let dy = (this._scratchPosition.y - current.y) * factor;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxSpeed) {
        const scale = maxSpeed / dist;
        dx *= scale;
        dy *= scale;
      }

      current.x += dx;
      current.y += dy;
    });
  },

  _updatePositions() {
    this._graph.forEachNode((node) => {
      this._readNodeTargetPosition(node.id, this._scratchPosition);
      const existing = this._nodePositions.get(node.id);
      if (existing) {
        existing.x = this._scratchPosition.x;
        existing.y = this._scratchPosition.y;
      } else {
        this._nodePositions.set(node.id, {
          x: this._scratchPosition.x,
          y: this._scratchPosition.y,
        });
      }
    });
  },
};
