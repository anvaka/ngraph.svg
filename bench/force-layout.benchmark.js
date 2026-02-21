import Benchmark from 'benchmark';
import generators from 'ngraph.generators';
import createLayout from 'ngraph.forcelayout';
import ForceLayoutAdapter from '../src/layout/ForceLayoutAdapter.js';

const nodeCount = getIntEnv('BENCH_NODES', 2000);
const degree = normalizeDegree(getIntEnv('BENCH_DEGREE', 6), nodeCount);
const rewiring = getFloatEnv('BENCH_REWIRING', 0.08);
const warmupSteps = getIntEnv('BENCH_WARMUP', 200);
const maxTime = getFloatEnv('BENCH_MAX_TIME', 1);

const graph = generators.wattsStrogatz(nodeCount, degree, rewiring);

const layoutOptions = {
  springLength: 30,
  springCoefficient: 0.0008,
  dragCoefficient: 0.04,
  gravity: -2.0,
  theta: 0.8,
  timeStep: 20,
};

const rawLayout = createLayout(graph, layoutOptions);
const adapter = new ForceLayoutAdapter(graph, {
  layeredLayout: false,
  smoothing: 1,
  maxSpeed: Number.POSITIVE_INFINITY,
  ...layoutOptions,
});

const adapterLayout = await adapter.getLayout();

for (let i = 0; i < warmupSteps; i += 1) {
  rawLayout.step();
  adapterLayout.step();
  adapter._updatePositions();
}

adapter._updatePositions();

console.log(
  `[bench] graph=wattsStrogatz nodes=${nodeCount} degree=${degree} rewiring=${rewiring} warmup=${warmupSteps}`
);

const suite = new Benchmark.Suite();

suite
  .add('raw layout.step()', {
    maxTime,
    fn() {
      rawLayout.step();
    },
  })
  .add('adapter layout.step()+_updatePositions()', {
    maxTime,
    fn() {
      adapterLayout.step();
      adapter._updatePositions();
    },
  })
  .on('cycle', (event) => {
    console.log(String(event.target));
  })
  .on('complete', function onComplete() {
    console.log(`[bench] fastest=${this.filter('fastest').map('name')}`);
    adapter.dispose();
  })
  .run({ async: false });

function getIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function getFloatEnv(name, fallback) {
  const value = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function normalizeDegree(value, nodes) {
  if (nodes <= 2) return 2;
  const maxValid = nodes - 1;
  let normalized = Math.max(2, Math.min(value, maxValid));
  if (normalized % 2 !== 0) normalized -= 1;
  return Math.max(2, normalized);
}
