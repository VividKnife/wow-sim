import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {request as httpRequest} from 'node:http';
import {cpus, platform, release, type as osType} from 'node:os';
import {dirname, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {MemoryStore} from '../packages/persistence/src/memory.ts';
import {GameService} from '../packages/game-domain/src/service.ts';
import {advance} from '../packages/game-domain/src/rules/engine.js';
import {buildGameResponse} from '../packages/game-domain/src/rules/server-response.js';
import {CONTENT_VERSION} from '../packages/game-domain/src/rules/client-content.js';
import {workshopView} from '../packages/game-domain/src/rules/workshop.js';
import {createGameServer} from '../apps/game-server/src/server.ts';
import {signGameToken} from '../apps/game-server/src/auth.ts';

const fixedNow = Date.UTC(2026, 8, 16, 0, 0, 0);
const accountId = 'foundation-benchmark-account';
const secret = 'foundation-benchmark-secret-at-least-32-bytes';
const warmupIterations = 20;
const measuredIterations = 100;
const dayMs = 24 * 60 * 60 * 1_000;
const utf8Bytes = (value) => Buffer.byteLength(value, 'utf8');
const round = (value) => Number(value.toFixed(6));

function ids() {
  let sequence = 0;
  return () => `foundation-${String(++sequence).padStart(4, '0')}`;
}

function responseFrom(snapshot) {
  return buildGameResponse(snapshot.state, snapshot.revision, {
    account: snapshot.account,
    roster: snapshot.roster,
    activities: snapshot.activities,
    instanceId: snapshot.instanceId,
    instance: snapshot.instance,
  });
}

function statistics(values) {
  assert.equal(values.length, measuredIterations);
  return {
    unit: 'milliseconds',
    samples: values.length,
    average: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    minimum: round(Math.min(...values)),
    maximum: round(Math.max(...values)),
  };
}

function viewBreakdown(view) {
  const fields = Object.entries(view).map(([field, value]) => ({
    field,
    valueBytes: utf8Bytes(JSON.stringify(value)),
    entryBytes: utf8Bytes(JSON.stringify({[field]: value})) - 2,
  })).sort((a, b) => b.entryBytes - a.entryBytes || a.field.localeCompare(b.field));
  return {
    encoding: 'UTF-8 JSON',
    totalBytes: utf8Bytes(JSON.stringify(view)),
    fieldCount: fields.length,
    fields,
  };
}

function actualHttp(url, headers = {}) {
  return new Promise((resolveRequest, reject) => {
    const request = httpRequest(url, {method: 'GET', headers}, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        const statusLine = `HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage}\r\n`;
        let headerBytes = utf8Bytes(statusLine) + 2;
        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          headerBytes += utf8Bytes(`${response.rawHeaders[index]}: ${response.rawHeaders[index + 1]}\r\n`);
        }
        resolveRequest({
          status: response.statusCode,
          etag: response.headers.etag ?? null,
          headerBytes,
          decodedBodyBytes: body.byteLength,
          decodedMessageBytes: headerBytes + body.byteLength,
          body,
        });
      });
    });
    request.once('error', reject);
    request.end();
  });
}

async function measure() {
  const store = new MemoryStore();
  const service = new GameService(store, {
    contentVersion: CONTENT_VERSION,
    now: () => fixedNow,
    id: ids(),
    seed: () => 0x12345678,
  });
  let game;
  try {
    const snapshot = await service.createAccount(
      accountId,
      {name: 'Foundation Mage', classId: 8, raceId: 1},
      'foundation-create-request',
    );
    const initialResponse = responseFrom(snapshot);
    const serializedResponse = JSON.stringify(initialResponse);

    for (let index = 0; index < warmupIterations; index++) JSON.stringify(responseFrom(snapshot));
    const responseTimes = [];
    for (let index = 0; index < measuredIterations; index++) {
      const started = performance.now();
      JSON.stringify(responseFrom(snapshot));
      responseTimes.push(performance.now() - started);
    }

    const workshopQuery = {profession: 'tailoring', search: '', filter: 'all', page: 0, pageSize: 24};
    for (let index = 0; index < 5; index++) JSON.stringify(workshopView(snapshot.state, workshopQuery));
    const workshopStarted = performance.now();
    const workshop = workshopView(snapshot.state, workshopQuery);
    const serializedWorkshop = JSON.stringify(workshop);
    const workshopElapsed = performance.now() - workshopStarted;

    const idleState = structuredClone(snapshot.state);
    const idleStarted = performance.now();
    const idleResult = advance(idleState, fixedNow + dayMs, {maxTicks: 1});
    const idleElapsed = performance.now() - idleStarted;
    assert.equal(idleResult.complete, true, 'quiet idle fast-forward must complete with maxTicks=1');
    assert.equal(idleResult.state.wallAt - snapshot.state.wallAt, dayMs);

    game = createGameServer({service, secret});
    game.server.listen(0, '127.0.0.1');
    await once(game.server, 'listening');
    const address = game.server.address();
    assert.ok(address && typeof address === 'object');
    const token = await signGameToken({sub: accountId}, secret);
    const url = `http://127.0.0.1:${address.port}/game`;
    const http200 = await actualHttp(url, {authorization: `Bearer ${token}`});
    assert.equal(http200.status, 200);
    assert.ok(http200.etag);
    const http304 = await actualHttp(url, {authorization: `Bearer ${token}`, 'if-none-match': http200.etag});
    assert.equal(http304.status, 304);
    assert.equal(http304.decodedBodyBytes, 0);

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      environment: {
        node: process.version,
        os: {type: osType(), platform: platform(), release: release(), arch: process.arch},
        logicalCpuCount: cpus().length,
      },
      fixture: {
        authoritativeTime: new Date(fixedNow).toISOString(),
        accountId,
        characterId: snapshot.state.id,
        character: {name: snapshot.state.name, classId: snapshot.state.classId, raceId: snapshot.state.raceId},
        rngSeed: 0x12345678,
        contentVersion: CONTENT_VERSION,
        store: 'MemoryStore',
      },
      scope: {
        description: 'Local single-process foundation measurement with one deterministic account and loopback HTTP.',
        includes: ['DTO projection and UTF-8 JSON serialization', 'one workshop page', 'quiet 24-hour engine advance', 'Node HTTP status/header/decoded-body bytes'],
        excludes: ['production infrastructure', 'PostgreSQL/network contention', 'TLS', 'compression', 'concurrency', 'TCP framing', 'HTTP chunk framing'],
        percentileClaim: null,
      },
      response: {
        serializedBytes: utf8Bytes(serializedResponse),
        encoding: 'UTF-8 JSON',
        revision: initialResponse.revision,
        initialView: viewBreakdown(initialResponse.snapshot.view),
        timing: {warmupIterations, measuredIterations, operation: 'buildGameResponse plus JSON.stringify', ...statistics(responseTimes)},
      },
      workshop: {
        query: workshopQuery,
        serializedBytes: utf8Bytes(serializedWorkshop),
        elapsedMs: round(workshopElapsed),
        returnedRecipes: workshop.recipes.length,
        totalRecipes: workshop.total,
        page: workshop.page,
        pageSize: workshop.pageSize,
      },
      quietIdle24Hours: {
        requestedElapsedMs: dayMs,
        maxTicks: 1,
        complete: idleResult.complete,
        advancedWallMs: idleResult.state.wallAt - snapshot.state.wallAt,
        advancedClockMs: idleResult.state.clock - snapshot.state.clock,
        elapsedMs: round(idleElapsed),
      },
      http: {
        transport: 'Node HTTP server on 127.0.0.1 ephemeral port',
        byteAccounting: 'HTTP status line and raw response headers plus decoded response body; excludes chunk framing and lower transport layers.',
        initial200: {
          status: http200.status,
          headerBytes: http200.headerBytes,
          decodedBodyBytes: http200.decodedBodyBytes,
          decodedMessageBytes: http200.decodedMessageBytes,
          etag: http200.etag,
        },
        conditional304: {
          status: http304.status,
          headerBytes: http304.headerBytes,
          decodedBodyBytes: http304.decodedBodyBytes,
          decodedMessageBytes: http304.decodedMessageBytes,
          etag: http304.etag,
        },
      },
    };
  } finally {
    if (game) await game.close();
    await store.close();
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, process.argv[2] || 'docs/development/foundation-measurements.json');
const report = await measure();
await mkdir(dirname(outputPath), {recursive: true});
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote foundation measurements to ${outputPath}`);
