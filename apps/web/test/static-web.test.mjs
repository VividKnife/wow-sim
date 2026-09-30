import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {createWebServer} from '../server.mjs';
import {rewriteAssetLiterals,publicAssetUrl} from '../../../packages/contracts/src/asset-paths.mjs';

test('public URLs are rewritten without touching API or navigation',()=>{
 const base='https://cdn.test/public/version';
 assert.equal(rewriteAssetLiterals('src="/icons/x.png"; `/maps/${id}.jpg`; url(\'/scenes/x.webp\'); fetch("/api/game")',base),`src="${base}/icons/x.png"; \`${base}/maps/\${id}.jpg\`; url('${base}/scenes/x.webp'); fetch("/api/game")`);
 for(const path of ['/api/game','/login','//evil.test/x','https://other.test/icons/x'])assert.equal(publicAssetUrl(path,base),path);
 assert.equal(publicAssetUrl('/icons/x.png',base),base+'/icons/x.png');
});

test('R2 gateway serves only HTML and API; forwards session and CSRF headers without buffering',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'wow-static-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await mkdir(join(dir,'model-viewer'));await mkdir(join(dir,'assets'));
 await writeFile(join(dir,'index.html'),'<div id="root"></div>');
 await writeFile(join(dir,'model-viewer/index.html'),'viewer');
 await writeFile(join(dir,'assets/game.js'),'must not be served');
 await writeFile(join(dir,'__deployment.json'),JSON.stringify({assetMode:'r2'}));
 const api=createServer((req,res)=>{assert.equal(req.url,'/api/game?saveId=one');assert.equal(req.headers.cookie,'wow_session=test');assert.equal(req.headers.origin,'https://game.test');res.writeHead(200,{'content-type':'application/json','set-cookie':'wow_session=next; HttpOnly'});req.pipe(res);});
 api.listen(0,'127.0.0.1');await once(api,'listening');t.after(()=>new Promise(resolve=>api.close(resolve)));
 const web=await createWebServer({dist:dir,backend:`http://127.0.0.1:${api.address().port}`,trustProxy:false});
 web.listen(0,'127.0.0.1');await once(web,'listening');t.after(()=>new Promise(resolve=>web.close(resolve)));
 const origin=`http://127.0.0.1:${web.address().port}`;
 for(const path of ['/','/login','/admin','/admin/','/model-viewer/index.html']){const response=await fetch(origin+path);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');}
 for(const path of ['/assets/game.js','/icons/x.png','/simulation-content/foo','/missing'])assert.equal((await fetch(origin+path)).status,404);
 const response=await fetch(origin+'/api/game?saveId=one',{method:'POST',headers:{origin:'https://game.test',cookie:'wow_session=test'},body:'{"ok":true}'});
 assert.deepEqual(await response.json(),{ok:true});assert.match(response.headers.get('set-cookie'),/HttpOnly/);
});

test('bundled static media supports byte ranges and HEAD; missing files never return HTML',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'wow-media-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await mkdir(join(dir,'music'));await writeFile(join(dir,'music/sample.mp3'),'0123456789');await writeFile(join(dir,'__deployment.json'),JSON.stringify({assetMode:'bundled'}));
 const web=await createWebServer({dist:dir,publicDir:dir});web.listen(0,'127.0.0.1');await once(web,'listening');t.after(()=>new Promise(resolve=>web.close(resolve)));
 const origin=`http://127.0.0.1:${web.address().port}`;
 const range=await fetch(origin+'/music/sample.mp3',{headers:{range:'bytes=3-5'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),'bytes 3-5/10');assert.equal(await range.text(),'345');
 const suffix=await fetch(origin+'/music/sample.mp3',{headers:{range:'bytes=-2'}});assert.equal(await suffix.text(),'89');
 assert.equal((await fetch(origin+'/music/sample.mp3',{headers:{range:'bytes=99-'}})).status,416);
 const head=await fetch(origin+'/music/sample.mp3',{method:'HEAD'});assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');
 assert.equal((await fetch(origin+'/assets/missing.js')).status,404);
});
