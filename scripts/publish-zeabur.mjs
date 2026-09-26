import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Zeabur builds a small application tree. Only bundled mode downloads the
// full public directory from the pinned source commit.
const assetMode = process.env.WEB_ASSET_MODE || 'r2';
if (!['r2', 'bundled'].includes(assetMode)) throw new Error('WEB_ASSET_MODE must be r2 or bundled');
const branch = 'codex/zeabur-deploy';
const publish = process.argv.includes('--publish');
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const temporary = mkdtempSync(join(tmpdir(), 'wow-sim-deploy-index-'));
const env = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') };
const git = (args, input) => execFileSync('git', args, {
  encoding: 'utf8', env, input, maxBuffer: 16 * 1024 * 1024,
}).trim();

try {
  if (publish && git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0] !== source) {
    console.log('A newer main commit exists; leaving deployment to its workflow.');
    process.exitCode = 0;
  } else {
    git(['read-tree', source]);
    const omitted = git(['ls-tree', '-r', '--name-only', '-z', source]).split('\0')
      .filter(path => /^(apps\/web\/public\/|\.github\/|docs\/|\.tmp\/)/.test(path)
        && !(assetMode === 'r2' && path.startsWith('apps/web/public/model-viewer/')));
    git(['update-index', '--force-remove', '-z', '--stdin'], omitted.join('\0') + '\0');

    const original = git(['show', `${source}:Dockerfile`]);
    for (const required of ['COPY apps/web ./apps/web', 'COPY apps/web/public ./apps/web/public']) {
      if (original.split(required).length !== 2) throw new Error(`Unexpected Dockerfile: ${required}`);
    }
    const publicAssetVersion = git(['rev-parse', `${source}:apps/web/public`]);
    const metadata = JSON.stringify({ commit: source, source: 'VividKnife/wow-sim', publicAssetVersion, assetMode });
    const assets = `FROM node:24.11.1-bookworm-slim AS deployment-assets
ADD https://codeload.github.com/VividKnife/wow-sim/tar.gz/${source} /tmp/source.tar.gz
RUN mkdir /assets && tar -xzf /tmp/source.tar.gz -C /assets --strip-components=4 wow-sim-${source}/apps/web/public && rm /tmp/source.tar.gz
RUN printf '%s\\n' '${metadata}' > /assets/__deployment.json

`;
    const dockerfile = assetMode === 'r2' ? original + '\n' : assets + original
      .replace('COPY apps/web ./apps/web', 'COPY apps/web ./apps/web\nCOPY --from=deployment-assets /assets ./apps/web/public')
      .replace('COPY apps/web/public ./apps/web/public', 'COPY --from=deployment-assets /assets ./apps/web/public') + '\n';
    const addFile = (path, content) => {
      const blob = git(['hash-object', '-w', '--stdin'], content);
      git(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
    };
    if (assetMode === 'r2') addFile('apps/web/public/__deployment.json', metadata + '\n');
    addFile('Dockerfile', dockerfile);
    addFile('packages/DEPLOYMENT.json', metadata + '\n');
    const tree = git(['write-tree']);
    const files = git(['ls-tree', '-r', '--name-only', tree]).split('\n');
    if (files.some(path => /^(apps\/web\/public\/|\.github\/)/.test(path)
      && !(assetMode === 'r2' && (path.startsWith('apps/web/public/model-viewer/') || path === 'apps/web/public/__deployment.json')))) {
      throw new Error('Deployment tree still includes static assets or workflows');
    }
    const previous = git(['ls-remote', 'origin', `refs/heads/${branch}`]).split(/\s/)[0];
    let parent = [];
    let unchanged = false;
    if (previous) {
      git(['fetch', 'origin', `refs/heads/${branch}`]);
      parent = ['-p', previous];
      if (git(['rev-parse', `${previous}^{tree}`]) === tree) {
        console.log(`Deployment branch already contains ${source}`);
        unchanged = true;
      }
    }
    if (!unchanged) {
      const commit = git(['commit-tree', tree, ...parent, '-m', `Deploy main ${source}`]);
      console.log(`Source: ${source}\nAsset mode: ${assetMode}\nDeployment commit: ${commit}\nFiles: ${files.length}`);
      if (publish) git(['push', 'origin', `${commit}:refs/heads/${branch}`]);
      else console.log('Dry run: deployment commit created locally; no branch was pushed.');
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
