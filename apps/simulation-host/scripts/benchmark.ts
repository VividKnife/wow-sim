import {cpus, totalmem} from 'node:os';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import assert from 'node:assert/strict';
import {SimulationHost} from '../src/host.ts';
import {ResidentInstance} from '../src/instance.ts';
import {runtimeVersion} from '../src/version.ts';
import {advanceOwned} from '../../../packages/game-domain/src/rules/engine.js';
import {localScenarios, digest} from '../../../packages/simulation-tests/support/baseline.ts';

const rounds = Number(process.env.SIM_BENCH_ROUNDS ?? 3), duration = Number(process.env.SIM_BENCH_DURATION_MS ?? 5000);
if (!Number.isInteger(rounds) || rounds < 1 || !Number.isSafeInteger(duration) || duration < 100 || duration % 100) throw new Error('Invalid benchmark options');
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1];
const scenarios = localScenarios(), host = new SimulationHost();
// Do not report preparation/countdown as PvP combat throughput.
advanceOwned(scenarios.arena, 5000);
advanceOwned(scenarios.battleground, 45000);
const rows: unknown[] = [];
try {
  for (const [scenario, initial] of Object.entries(scenarios)) {
    for (const mode of ['owned', 'resident', 'worker+projection'] as const) {
      const elapsed: number[] = [], cpu: number[] = [], outputs: number[] = [];
      let finalHash = '';
      // Every mode gets its own unreported warmup, including the worker isolate.
      for (let round = -1; round < rounds; round++) {
        const id = `${scenario}-${mode}-${round}`, state = structuredClone(initial);
        const admission = {instanceId: id, ownerEpoch: 1, state, controllers: []};
        const resident = mode === 'resident' ? new ResidentInstance(admission) : null;
        if (mode === 'worker+projection') await host.admit(admission, {realtime: false});
        const start = performance.now(), used = process.cpuUsage(); let bytes = 0;
        for (let elapsed = 100; elapsed <= duration; elapsed += 100) {
          const until = initial.wallAt + elapsed;
          if (mode === 'owned') advanceOwned(state, until);
          else if (resident) resident.advance(until);
          else {
            assert.equal((await host.advance(id, until)).complete, true);
            bytes += Buffer.byteLength(JSON.stringify(await host.project(id, until)));
          }
        }
        const elapsedMs = performance.now() - start, consumption = process.cpuUsage(used);
        if (round >= 0) {
          elapsed.push(elapsedMs); cpu.push((consumption.user + consumption.system) / 1000); outputs.push(bytes);
        }
        const final = mode === 'owned' ? state : resident ? resident.checkpoint().state : (await host.checkpoint(id)).state;
        finalHash = digest(final);
        const expected = structuredClone(initial);
        for (let elapsed = 100; elapsed <= duration; elapsed += 100) advanceOwned(expected, initial.wallAt + elapsed);
        assert.equal(finalHash, digest(expected), `${scenario}/${mode} changed behavior`);
        if (mode === 'worker+projection') await host.remove(id);
      }
      rows.push({scenario, mode, rounds, duration, initialWallAt: initial.wallAt,
        initialPhase: initial.battleground?.phase ?? initial.arena?.phase ?? (initial.combat ? 'combat' : initial.activity.type),
        elapsedP50Ms: percentile(elapsed, .5), elapsedP95Ms: percentile(elapsed, .95),
        processCpuP50Ms: percentile(cpu, .5), outputBytes: outputs[0], finalHash});
    }
  }
} finally { await host.close(); }
const report = {measuredAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), commit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  ...runtimeVersion, workerCount: 1, rssBytes: process.memoryUsage().rss,
  limitations: 'Local rule/IPC microbenchmark; no PostgreSQL, WebSocket, network subscribers, GC attribution or 2-vCPU capacity claim. Projection is a stage-B public unit subset; does not include full game UI/logs.', rows};
const output = resolve(process.argv[2] ?? '.cache/simulation-benchmark.json');
mkdirSync(dirname(output), {recursive: true}); writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(output);
