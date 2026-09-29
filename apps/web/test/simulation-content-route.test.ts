import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {GET} from '../app/api/simulation-content/[version]/[pack]/route.ts';
import version from '../../../packages/game-data/runtime/version.json' with {type:'json'};
const request=new Request('https://game.test/api/simulation-content');
const get=(pack:string,v=version.version)=>GET(request,{params:Promise.resolve({version:v,pack})});

test('content is compressed, immutable, versioned and bounds checked',async()=>{
 const response=await get('boot');assert.equal(response.status,200);
 assert.equal(response.headers.get('content-encoding'),'gzip');assert.match(response.headers.get('cache-control')!,/immutable/);
 const boot=JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString());assert.equal(boot.version,version.version);
 assert.equal((await get('0','outdated')).status,409);
 for(const path of ['../catalog','-1','1e3','999999','01'])assert.equal((await get(path)).status,404,path);
});
