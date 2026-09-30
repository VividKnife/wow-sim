// Isolated production-build smoke: in-memory game + SQL auth, two browser origins.
// PLAYWRIGHT_MODULE may point to a bundled Playwright installation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {PGlite} from '@electric-sql/pglite';
import {AccountStore} from '../../game-server/src/account-store.ts';
import {createGameServer} from '../../game-server/src/server.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {CONTENT_VERSION} from '../../../packages/game-domain/src/rules/client-content.js';
import {createWebServer} from '../server.mjs';
import {createServer} from 'node:net';
const root=fileURLToPath(new URL('../',import.meta.url));
const metadata=JSON.parse(await readFile(root+'dist/__deployment.json','utf8'));
assert.equal(metadata.assetMode,'r2','Run an R2 build before this test');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const db=new PGlite(),accounts=new AccountStore({query:async(text,values)=>text.includes('CREATE TABLE')?(await db.exec(text),{rows:[]}):db.query(text,values)});
let game,web,browser,page;
const output=resolve(process.env.WEB_QA_OUTPUT||'/tmp/wow-vite-qa');await mkdir(output,{recursive:true});
try{
 await accounts.initialize();
 const credentials={username:'browser_smoke',password:'browser-smoke-password'};
 const {user}=await accounts.register(credentials.username,credentials.password);
 const service=new GameService(new MemoryStore(),{contentVersion:CONTENT_VERSION,seed:()=>60325});
 const save=await service.createSave(user.id,{name:'静态法师',classId:8,raceId:1},'create-fixture');
 await service.command(save.id,{type:'hunt',id:299,requestId:'hunt-fixture',localClientId:'fixture-bootstrap'});
 const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const origin=`http://127.0.0.1:${port}`;
 game=createGameServer({service,accounts,appOrigin:origin,trustProxyHops:0,publicAssetBase:metadata.publicAssetBase});
 game.server.listen(0,'127.0.0.1');await once(game.server,'listening');
 web=await createWebServer({backend:`http://127.0.0.1:${game.server.address().port}`,trustProxy:false});web.listen(port,'127.0.0.1');await once(web,'listening');
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const cdn=new URL(metadata.assetBase).origin,requests=[],errors=[],failed=[],apiFailures=[],checkpoints=[];
 await context.route(cdn+'/**',async route=>{
  const url=new URL(route.request().url());requests.push(url.href);
  const relative=url.href.startsWith(metadata.publicAssetBase+'/')?['public',url.href.slice(metadata.publicAssetBase.length+1)]:['dist',url.href.slice(metadata.assetBase.length)];
  const path=resolve(root,relative[0],decodeURIComponent(relative[1]));
  if(!path.startsWith(resolve(root,relative[0])+'/'))throw new Error('Invalid fixture asset');
  try{
   let body=await readFile(path);
   const type=path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.webp')?'image/webp':path.endsWith('.png')?'image/png':path.endsWith('.jpg')?'image/jpeg':path.endsWith('.json.gz')?'application/json':'application/octet-stream';
   if(path.endsWith('.json.gz'))body=gunzipSync(body);
   await route.fulfill({status:200,headers:{'access-control-allow-origin':origin,'content-type':type},body});
  }catch(error){failed.push(url.href+': '+error.message);await route.fulfill({status:404});}
 });
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async response=>{if(response.url().includes('/api/game/local')){const data=await response.json().catch(()=>({}));if(response.status()>=400)apiFailures.push(data);else if(response.request().postDataJSON()?.type==='checkpoint')checkpoints.push(data);}});
 const originAssets=[];page.on('request',req=>{const url=new URL(req.url());if(url.origin===origin&&!['/','/login','/model-viewer/index.html'].includes(url.pathname)&&!url.pathname.startsWith('/api/'))originAssets.push(url.pathname);});
 await page.goto(origin+'/login');await page.getByLabel('账号名称',{exact:true}).fill(credentials.username);await page.getByLabel('账号密码',{exact:true}).fill(credentials.password);
 assert.ok(!requests.some(url=>/\/game-[^/]+\.js/.test(url)),'login must not download game');
 await page.getByRole('button',{name:'登录并继续冒险'}).click();await page.waitForURL(origin+'/');
 await page.goto(origin+'/?saveId='+save.id);
 await page.getByText('静态法师',{exact:true}).first().waitFor({timeout:60000});
 await page.waitForFunction(()=>performance.getEntriesByType('resource').some(entry=>entry.name.includes('local-simulation.worker')),{},{timeout:60000});
 for(let attempt=0;attempt<120&&!requests.some(url=>/simulation-content\/[^/]+\/class-8\.json\.gz/.test(url));attempt++)await new Promise(r=>setTimeout(r,500));
 assert.ok(requests.some(url=>/simulation-content\/[^/]+\/boot\.json\.gz/.test(url)),'worker boot from CDN');
 assert.ok(requests.some(url=>/simulation-content\/[^/]+\/class-8\.json\.gz/.test(url)),'class pack from CDN');
 // Wait for local engine to publish real frames, not merely fetch its data.
 await page.waitForFunction(()=>document.body.innerText.includes('本地')||!document.body.innerText.includes('正在准备冒险'),{},{timeout:60000});
 for(let attempt=0;attempt<80&&!checkpoints.length;attempt++)await new Promise(r=>setTimeout(r,500));
 assert.ok(checkpoints.length,'local engine must commit a checkpoint');
 assert.deepEqual(apiFailures,[]);
 if(process.env.WEB_QA_DELAY)await new Promise(r=>setTimeout(r,Number(process.env.WEB_QA_DELAY)));
 const loot=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'战利品',exact:true})});
 if(await loot.isVisible())await loot.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'打开世界地图',exact:true}).click();
 await page.getByRole('button',{name:'关闭窗口',exact:true}).click();
 await page.screenshot({path:output+'/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(originAssets,[],'only HTML and API may hit Zeabur');
 await writeFile(output+'/result.json',JSON.stringify({requests,errors,originAssets,failed,apiFailures,checkpoints:checkpoints.length},null,2));
 console.log(`Browser smoke passed: login, save, ${requests.length} CDN loads, boot/class packs, desktop/mobile. Screenshots: ${output}`);
}catch(error){if(page){await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});console.error((await page.locator('body').innerText().catch(()=>'')));}throw error;}finally{await browser?.close();if(web)await new Promise(r=>web.close(r));await game?.close();await db.close();}
