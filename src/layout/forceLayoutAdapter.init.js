import createGraph from 'ngraph.graph';
import { analyzeComponents } from './analyzeComponents.js';
import { applyMotifLayout } from './applyMotifLayout.js';

export default {
  async _initLayout(options) {
    const createLayout = (await import('ngraph.forcelayout')).default;

    const graph = this._graph;
    const defaultNodeSize = 10;
    const getNodeSize = options.getNodeSize || ((nodeId) => {
      const node = graph.getNode(nodeId);
      return node?.data?.size || defaultNodeSize;
    });

    this._getNodeSize = getNodeSize;

    const nodePadding = options.nodePadding ?? 4;
    const baseSpringLength = options.springLength || 30;

    const nodeMass = (nodeId) => {
      const links = graph.getLinks(nodeId);
      const linkCount = links ? (links.size ?? links.length ?? 0) : 0;
      const size = getNodeSize(nodeId);
      return 1 + linkCount / 3 + size * 0.1;
    };

    const springTransform = (link, spring) => {
      const fromSize = getNodeSize(link.fromId);
      const toSize = getNodeSize(link.toId);
      const minDist = (fromSize + toSize) / 2 + nodePadding;
      spring.length = Math.max(baseSpringLength, minDist);
    };

    const finalOptions = {
      springLength: baseSpringLength,
      springCoefficient: options.springCoefficient || 0.0008,
      dragCoefficient: options.dragCoefficient || 0.04,
      gravity: options.gravity || -2.0,
      theta: options.theta || 0.8,
      timeStep: options.timeStep || 20,
      ...options,
      nodeMass: options.nodeMass || nodeMass,
      springTransform: options.springTransform || springTransform,
    };

    this._layoutOptions = finalOptions;
    this._componentPacked = false;
    this._componentFrameCounter = 0;

    if (this._componentLayout && this._initComponentLayouts(createLayout, finalOptions)) {
      this._layout = null;
      this._phase = null;
      this._hiddenNodes.clear();
      this._componentLayoutProxy = this._createComponentLayoutProxy();
      return this._componentLayoutProxy;
    }

    this._componentContexts.length = 0;
    this._componentPackInput.length = 0;
    this._nodeToComponentContext.clear();
    this._componentLayoutProxy = null;

    this._layout = createLayout(graph, finalOptions);
    return this._layout;
  },

  _initComponentLayouts(createLayout, layoutOptions) {
    const analysis = analyzeComponents(this._graph, {
      detectMotifs: this._motifLayout,
      motifMaxSize: this._motifMaxSize,
    });

    const components = analysis.components;
    if (components.length <= 1) return false;

    const linksByComponent = new Array(components.length);
    for (let i = 0; i < linksByComponent.length; ++i) linksByComponent[i] = [];

    this._graph.forEachLink((link) => {
      const fromComponent = analysis.nodeToComponent.get(link.fromId);
      const toComponent = analysis.nodeToComponent.get(link.toId);
      if (fromComponent === undefined || fromComponent !== toComponent) return;
      linksByComponent[fromComponent].push(link);
    });

    this._componentContexts.length = 0;
    this._componentPackInput.length = 0;
    this._nodeToComponentContext.clear();

    const componentCount = components.length;
    for (let i = 0; i < componentCount; ++i) {
      const component = components[i];
      const context = {
        id: component.id,
        nodes: component.nodes,
        layout: null,
        motif: component.motif,
        motifPositions: null,
        offsetX: 0,
        offsetY: 0,
        targetOffsetX: 0,
        targetOffsetY: 0,
        stableFrames: 0,
        isSleeping: false,
        lastEnergy: 0,
        boundsDirty: true,
        bounds: { left: 0, top: 0, right: 0, bottom: 0, width: 1, height: 1 },
      };

      if (this._motifLayout && component.motif) {
        const motifPositions = new Map();
        applyMotifLayout(component, motifPositions, this._getNodeSize);
        context.motifPositions = motifPositions;
        context.isSleeping = true;
      } else {
        const subgraph = createGraph();

        for (let n = 0; n < component.nodes.length; ++n) {
          const nodeId = component.nodes[n];
          const original = this._graph.getNode(nodeId);
          subgraph.addNode(nodeId, original ? original.data : undefined);
        }

        const componentLinks = linksByComponent[i];
        for (let l = 0; l < componentLinks.length; ++l) {
          const link = componentLinks[l];
          subgraph.addLink(link.fromId, link.toId, link.data);
        }

        const layout = createLayout(subgraph, layoutOptions);
        const seedAngle = (Math.PI * 2 * i) / componentCount;
        const seedRadius = 120 + Math.sqrt(component.nodes.length) * 8;
        const seedX = Math.cos(seedAngle) * seedRadius;
        const seedY = Math.sin(seedAngle) * seedRadius;

        for (let n = 0; n < component.nodes.length; ++n) {
          const nodeId = component.nodes[n];
          const pos = layout.getNodePosition(nodeId);
          const jitterX = ((n % 7) - 3) * 0.7;
          const jitterY = ((n % 11) - 5) * 0.7;
          pos.x = seedX + jitterX;
          pos.y = seedY + jitterY;
        }

        context.layout = layout;
        context.isSleeping = false;
      }

      this._computeComponentBounds(context);
      this._componentContexts.push(context);

      for (let n = 0; n < component.nodes.length; ++n) {
        this._nodeToComponentContext.set(component.nodes[n], context);
      }
    }

    this._packComponentContexts(true);

    return true;
  },
};
