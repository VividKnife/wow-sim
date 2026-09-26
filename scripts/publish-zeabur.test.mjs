import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

test('publishes a small, pinned deployment tree without changing main', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'zeabur-publish-test-'));
  const repo = join(temporary, 'source');
  const remote = join(temporary, 'remote.git');
  mkdirSync(repo);
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.test',
    WEB_ASSET_MODE: 'r2', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.test' };
  const git = (...args) => execFileSync('git', args, { cwd: repo, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const write = (path, content) => {
    const target = join(repo, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  };
  const publish = () => execFileSync(process.execPath,
    [fileURLToPath(new URL('./publish-zeabur.mjs', import.meta.url)), '--publish'],
    { cwd: repo, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const deployment = () => git('ls-remote', 'origin', 'refs/heads/codex/zeabur-deploy').split(/\s/)[0];
  try {
    git('init', '--bare', remote);
    git('init', '-b', 'main');
    git('remote', 'add', 'origin', remote);
    write('Dockerfile', 'FROM node:24.11.1-bookworm-slim\nCOPY apps/web ./apps/web\nCOPY apps/web/public ./apps/web/public\n');
    write('apps/web/app/page.tsx', 'application');
    write('apps/web/public/model-viewer/index.html', 'same-origin viewer');
    write('apps/web/public/model-viewer/asset-cache-sw.js', 'same-origin worker');
    write('apps/web/public/creatures/model.glb', 'large assets stay on main');
    write('.github/workflows/ci.yml', 'workflow');
    write('packages/game-domain/rules.js', 'rules');
    git('add', '.');
    git('commit', '-m', 'Initial source');
    git('push', 'origin', 'main');
    const source = git('rev-parse', 'HEAD');
    publish();
    const first = deployment();
    const paths = git('ls-tree', '-r', '--name-only', first);
    assert.ok(paths.includes('apps/web/app/page.tsx'));
    assert.ok(paths.includes('packages/game-domain/rules.js'));
    assert.ok(!paths.includes('apps/web/public/creatures/'));
    assert.ok(paths.includes('apps/web/public/model-viewer/index.html'));
    assert.ok(paths.includes('apps/web/public/model-viewer/asset-cache-sw.js'));
    assert.equal(JSON.parse(git('show', `${first}:apps/web/public/__deployment.json`)).assetMode, 'r2');
    assert.ok(!paths.includes('.github/'));
    assert.equal(JSON.parse(git('show', `${first}:packages/DEPLOYMENT.json`)).commit, source);
    assert.equal(JSON.parse(git('show', `${first}:packages/DEPLOYMENT.json`)).publicAssetVersion, git('rev-parse', `${source}:apps/web/public`));
    assert.ok(!git('show', `${first}:Dockerfile`).includes('codeload.github.com'));
    assert.ok(!git('show', `${first}:Dockerfile`).includes('deployment-assets'));
    assert.equal(git('rev-parse', 'HEAD'), source);
    assert.equal(git('status', '--porcelain'), '');
    publish();
    assert.equal(deployment(), first, 'reruns must not create duplicate deployment commits');
    env.WEB_ASSET_MODE = 'bundled';
    publish();
    const bundled = deployment();
    assert.notEqual(bundled, first, 'changing mode redeploys the same source');
    assert.equal(git('rev-parse', `${bundled}^`), first);
    assert.ok(git('show', `${bundled}:Dockerfile`).includes(`/tar.gz/${source}`));
    assert.ok(git('show', `${bundled}:Dockerfile`).includes('COPY --from=deployment-assets /assets ./apps/web/public'));
    assert.ok(git('show', `${bundled}:Dockerfile`).includes('"assetMode":"bundled"'));
    assert.ok(!git('ls-tree', '-r', '--name-only', bundled).includes('apps/web/public/'));
    publish();
    assert.equal(deployment(), bundled);
    env.WEB_ASSET_MODE = 'invalid';
    assert.throws(publish, /WEB_ASSET_MODE must be r2 or bundled/);
    assert.equal(deployment(), bundled);
    env.WEB_ASSET_MODE = 'r2';
    publish();
    const restored = deployment();
    assert.equal(git('rev-parse', `${restored}^{tree}`), git('rev-parse', `${first}^{tree}`));
    write('packages/game-domain/rules.js', 'updated rules');
    git('add', '.');
    git('commit', '-m', 'Update source');
    publish();
    assert.equal(deployment(), restored, 'a stale or unpushed source must not replace deployment');
    git('push', 'origin', 'main');
    publish();
    const second = deployment();
    assert.notEqual(second, first);
    assert.equal(git('rev-parse', `${second}^`), restored, 'updates must fast-forward deployment history');
    assert.equal(git('show', `${second}:packages/game-domain/rules.js`), 'updated rules');
    assert.equal(git('status', '--porcelain'), '');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
