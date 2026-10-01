import assert from 'node:assert/strict';
import {cpus, totalmem} from 'node:os';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {SimulationHost} from '../src/host.ts';
import {runtimeVersion} from '../src/version.ts';
import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
import {localScenarios, digest} from '../../../packages/simulation-tests/support/baseline.ts';

// This measures scheduler inactivity, not server capacity. Preparation, warmup
// and checkpoint serialization are outside each measured interval.
const rows = [];
const rounds = 3, durationMs = 2000;
for (const workload of [{idle: 64, combat: 0}, {idle: 0, combat: 1}, {idle: 64, combat: 1}]) {
  const host = new SimulationHost();
  try {
    const ids = Array.from({length: workload.idle}, (_, i) => `idle-${i}`);
    for (const id of ids) await host.admit({instanceId: id, ownerEpoch: 1,
      state: createGame('空闲测量', 123, 0), controllers: []});
    if (workload.combat) await host.admit({instanceId: 'combat', ownerEpoch: 1, state: localScenarios().solo, controllers: []});
    await delay(500);
    const idleBefore = await Promise.all(ids.map(id => host.checkpoint(id)));
    for (let round = 0; round < rounds; round++) {
      const before = workload.combat ? await host.checkpoint('combat') : null;
      const started = performance.now(), used = process.cpuUsage();
      await delay(durationMs);
      const wallMs = performance.now() - started, cpu = process.cpuUsage(used);
      const after = workload.combat ? await host.checkpoint('combat') : null;
      const idleAfter = await Promise.all(ids.map(id => host.checkpoint(id)));
      assert.equal(digest(idleAfter), digest(idleBefore), 'no autonomous advancement in dormant rooms');
      if (after && before) assert.ok(after.state.clock > before.state.clock, 'active room advances without requests');
      rows.push({...workload, round, wallMs, processCpuMs: (cpu.user + cpu.system) / 1000,
        dormantCheckpointsUnchanged: ids.length, combatSimElapsedMs: after && before ? after.state.clock - before.state.clock : 0});
    }
  } finally { await host.close(); }
}
const output = resolve(process.argv[2] ?? '.cache/simulation-wakes.json');
const report = {measuredAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), ...runtimeVersion,
  workerCount: 1, rounds, durationMs,
  limitations: 'Local real-worker scheduling measurement, no PostgreSQL, WebSocket or clients; CPU is whole-process CPU, not an isolated rule profile. Empty recovered idle actors have no NPC world, effects or auctions. No old-version comparison or capacity claim.', rows};
mkdirSync(dirname(output), {recursive: true}); writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(output);
