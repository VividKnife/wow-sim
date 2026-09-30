import test from 'node:test';
import {createHash} from 'node:crypto';
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
    write('apps/web/main.tsx', 'application');
    write('.gitignore','apps/web/dist/\n');
    write('apps/web/public/model-viewer/index.html', 'same-origin viewer');
    write('apps/web/public/model-viewer/bridge.js', 'static viewer');
    write('apps/web/public/creatures/model.glb', 'large assets stay on main');
    write('.github/workflows/ci.yml', 'workflow');
    write('packages/game-domain/rules.js', 'rules');
    git('add', '.');
    git('commit', '-m', 'Initial source');
    git('push', 'origin', 'main');
    const source = git('rev-parse', 'HEAD');
    const build=()=>{
      const metadata={commit:git('rev-parse','HEAD'),publicAssetVersion:git('rev-parse','HEAD:apps/web/public'),assetMode:env.WEB_ASSET_MODE,buildId:'test-build'};
      const files={'__deployment.json':JSON.stringify(metadata),'assets/game.js':'game bundle','index.html':'static entry','model-viewer/index.html':'static viewer'};
      const hash=createHash('sha256');
      for(const path of Object.keys(files).sort()){write('apps/web/dist/'+path,files[path]);hash.update(path+'\0').update(files[path]);}
      write('apps/web/dist/.r2-upload.json',JSON.stringify({buildId:metadata.buildId,digest:hash.digest('hex')}));
    };
    build();
    publish();
    const first = deployment();
    const paths = git('ls-tree', '-r', '--name-only', first);
    assert.ok(paths.includes('apps/web/main.tsx'));
    assert.ok(paths.includes('packages/game-domain/rules.js'));
    assert.ok(!paths.includes('apps/web/public/creatures/'));
    assert.ok(paths.includes('apps/web/dist/model-viewer/index.html'));
    assert.ok(!paths.includes('apps/web/dist/assets/'));
    assert.ok(!paths.includes('apps/web/public/'));
    assert.equal(JSON.parse(git('show', `${first}:apps/web/dist/__deployment.json`)).assetMode, 'r2');
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
    build();
    publish();
    const bundled = deployment();
    assert.notEqual(bundled, first, 'changing mode redeploys the same source');
    assert.equal(git('rev-parse', `${bundled}^`), first);
    assert.ok(git('show', `${bundled}:Dockerfile`).includes(`/tar.gz/${source}`));
    assert.ok(git('show', `${bundled}:Dockerfile`).includes('COPY --from=deployment-assets /assets ./apps/web/public'));
    assert.ok(git('ls-tree','-r','--name-only',bundled).includes('apps/web/dist/assets/game.js'));
    assert.ok(!git('ls-tree', '-r', '--name-only', bundled).includes('apps/web/public/'));
    publish();
    assert.equal(deployment(), bundled);
    env.WEB_ASSET_MODE = 'invalid';
    assert.throws(publish, /WEB_ASSET_MODE must be r2 or bundled/);
    assert.equal(deployment(), bundled);
    env.WEB_ASSET_MODE = 'r2';
    build();
    // Incomplete/stale uploads cannot advance the deployment branch.
    write('apps/web/dist/assets/game.js','changed after upload');
    assert.throws(publish,/Matching R2 upload/);
    build();
    publish();
    const restored = deployment();
    assert.equal(git('rev-parse', `${restored}^{tree}`), git('rev-parse', `${first}^{tree}`));
    write('packages/game-domain/rules.js', 'updated rules');
    git('add', '.');
    git('commit', '-m', 'Update source');
    publish();
    assert.equal(deployment(), restored, 'a stale or unpushed source must not replace deployment');
    git('push', 'origin', 'main');
    assert.throws(publish,/Build metadata/);
    build();
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
