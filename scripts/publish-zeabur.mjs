import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {createHash} from 'node:crypto';

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
    const omitted = git(['ls-tree','-r','--name-only','-z',source]).split('\0').filter(path=>/^(apps\/web\/public\/|\.github\/|docs\/|\.tmp\/)/.test(path));
    git(['update-index','--force-remove','-z','--stdin'],omitted.join('\0')+'\0');
    const metadata=JSON.parse(readFileSync('apps/web/dist/__deployment.json','utf8'));
    if(metadata.commit!==source||metadata.assetMode!==assetMode||metadata.publicAssetVersion!==git(['rev-parse',`${source}:apps/web/public`]))throw new Error('Build metadata does not match deployment source or mode');
    const buildFiles=[];
    function walk(path=''){
      for(const entry of readdirSync(join('apps/web/dist',path),{withFileTypes:true})){
        if(entry.name.startsWith('.'))continue;
        const name=path?path+'/'+entry.name:entry.name;
        if(entry.isDirectory())walk(name);else if(entry.isFile())buildFiles.push(name);else throw new Error('Build assets must be regular files');
      }
    }
    walk();buildFiles.sort();
    if(assetMode==='r2'){
      const receipt=JSON.parse(readFileSync('apps/web/dist/.r2-upload.json','utf8'));
      const digest=createHash('sha256');
      for(const name of buildFiles)digest.update(name+'\0').update(readFileSync(join('apps/web/dist',name)));
      if(receipt.buildId!==metadata.buildId||receipt.digest!==digest.digest('hex'))throw new Error('Matching R2 upload must complete before deployment');
    }
    const addFile=(path,content)=>{
      const blob=git(['hash-object','-w','--stdin'],content);
      git(['update-index','--add','--cacheinfo',`100644,${blob},${path}`]);
    };
    for(const name of buildFiles){
      if(assetMode==='r2'&&!['index.html','model-viewer/index.html','__deployment.json'].includes(name))continue;
      addFile('apps/web/dist/'+name,readFileSync(join('apps/web/dist',name)));
    }
    const assetStage=assetMode==='bundled'?`FROM node:24.11.1-bookworm-slim AS deployment-assets
ADD https://codeload.github.com/VividKnife/wow-sim/tar.gz/${source} /tmp/source.tar.gz
RUN mkdir /assets && tar -xzf /tmp/source.tar.gz -C /assets --strip-components=4 wow-sim-${source}/apps/web/public
`:'';
    addFile('Dockerfile',assetStage+`FROM node:24.11.1-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY apps/web/server.mjs ./apps/web/server.mjs
COPY apps/web/dist ./apps/web/dist
COPY packages/contracts/src/asset-paths.mjs ./packages/contracts/src/asset-paths.mjs
${assetMode==='bundled'?'COPY --from=deployment-assets /assets ./apps/web/public':''}
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.mjs"]
`);
    addFile('packages/DEPLOYMENT.json',JSON.stringify(metadata)+'\n');
    const tree=git(['write-tree']);
    const files=git(['ls-tree','-r','--name-only',tree]).split('\n');
    if(files.some(path=>/^(apps\/web\/public\/|\.github\/)/.test(path)))throw new Error('Deployment tree still includes public assets or workflows');
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
