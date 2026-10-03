import {spawnSync} from 'node:child_process';

const assetMode=process.env.WEB_ASSET_MODE||'r2';
if(!['r2','bundled'].includes(assetMode))throw new Error('WEB_ASSET_MODE must be r2 or bundled');

function run(command,args,{env={}}={}){
 console.log(`\n> ${command} ${args.join(' ')}`);
 const result=spawnSync(command,args,{stdio:'inherit',windowsHide:true,env:{...process.env,WEB_ASSET_MODE:assetMode,...env}});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}

let buildId=process.env.WEB_BUILD_ID;
if(!buildId){
 const revision=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true});
 if(revision.error)throw revision.error;
 if(revision.status!==0)process.exit(revision.status??1);
 buildId=revision.stdout.trim();
}

run('npm',['run','data:check']);
run('node',['--test','scripts/game-version.test.mjs','scripts/publish-zeabur.test.mjs','scripts/publish-r2-assets.test.mjs','scripts/verify-deployment.test.mjs','apps/web/test/static-web.test.mjs','packages/simulation-tests/baseline.test.ts','packages/game-domain/test/runtime-retirement.test.ts']);
run('npm',['run','typecheck']);
run('npm',['--prefix','apps/web','run','typecheck']);
run('npm',['--prefix','apps/web','run','build'],{env:{WEB_BUILD_ID:buildId}});
run('node',['scripts/verify-web-build.mjs']);
run('docker',['build','-f','Dockerfile.runtime','-t','wow-sim-runtime:ci','.']);
run('node',['scripts/verify-production.mjs'],{env:{RUNTIME_IMAGE:'wow-sim-runtime:ci'}});

console.log('\nCI validation passed.');
