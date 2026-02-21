import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const thisFile = fileURLToPath(import.meta.url);
const benchDir = path.dirname(thisFile);

const benches = [
  {
    key: 'layout',
    label: 'Layout Hot Loop',
    file: path.join(benchDir, 'force-layout.benchmark.js'),
  },
  {
    key: 'layered',
    label: 'Layered Orchestration',
    file: path.join(benchDir, 'force-layout-layered.benchmark.js'),
  },
];

const results = [];

for (const bench of benches) {
  const run = spawnSync(process.execPath, [bench.file], {
    cwd: path.dirname(benchDir),
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = `${run.stdout || ''}${run.stderr || ''}`;
  const lines = output.split(/\r?\n/);
  const metrics = lines.filter((line) => line.includes(' x ') && line.includes('ops/sec'));
  const fastestLine = lines.find((line) => line.startsWith('[bench] fastest=')) || '[bench] fastest=n/a';

  results.push({
    ...bench,
    ok: run.status === 0,
    status: run.status,
    metrics,
    fastestLine,
    output,
  });
}

let hasFailure = false;
console.log('[bench] combined layout benchmark summary');

for (const result of results) {
  console.log(`\n[bench] ${result.label}`);
  if (!result.ok) {
    hasFailure = true;
    console.log(`[bench] failed (exit=${result.status})`);
    console.log(result.output.trim());
    continue;
  }

  if (result.metrics.length === 0) {
    console.log('[bench] no metric lines found');
  } else {
    for (const metric of result.metrics) {
      console.log(metric);
    }
  }

  console.log(result.fastestLine);
}

if (hasFailure) {
  process.exit(1);
}
