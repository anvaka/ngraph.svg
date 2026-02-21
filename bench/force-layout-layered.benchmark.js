import Benchmark from 'benchmark';
import generators from 'ngraph.generators';
import ForceLayoutAdapter from '../src/layout/ForceLayoutAdapter.js';

const PHASE_STRESS_REFINE = 'STRESS_REFINE';
const PHASE_DONE = 'DONE';

const nodeCount = getIntEnv('BENCH_NODES', 2000);
const degree = normalizeDegree(getIntEnv('BENCH_DEGREE', 6), nodeCount);
const rewiring = getFloatEnv('BENCH_REWIRING', 0.08);
const warmupSteps = getIntEnv('BENCH_WARMUP', 200);
const maxTime = getFloatEnv('BENCH_MAX_TIME', 1);

const graph = generators.wattsStrogatz(nodeCount, degree, rewiring);
const adapter = new ForceLayoutAdapter(graph, {
  layeredLayout: true,
  smoothing: 1,
  maxSpeed: Number.POSITIVE_INFINITY,
});

const layout = await adapter.getLayout();

for (let i = 0; i < warmupSteps; i += 1) {
  layout.step();
  adapter._updatePositions();
}

console.log(
  `[bench] layered graph=wattsStrogatz nodes=${nodeCount} degree=${degree} rewiring=${rewiring} warmup=${warmupSteps}`
);

const suite = new Benchmark.Suite();

suite
  .add('layered _initOrchestration()', {
    maxTime,
    fn() {
      adapter._initOrchestration();
    },
  })
  .add('layered orchestration full phase sweep', {
    maxTime,
    fn() {
      adapter._initOrchestration();

      let guard = 0;
      while (adapter._phase !== PHASE_DONE && guard < 4096) {
        adapter._advancePhase();

        if (adapter._phase === PHASE_STRESS_REFINE) {
          adapter._advancePhase();
        }

        guard += 1;
      }
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
