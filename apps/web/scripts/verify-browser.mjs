// Isolated production-build smoke: in-memory game + SQL auth, two browser origins.
// PLAYWRIGHT_MODULE may point to a bundled Playwright installation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {residentBrowserFixture} from './support/resident-browser-fixture.mjs';
import {applyGameEvent} from '../../../packages/contracts/src/events.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const metadata=JSON.parse(await readFile(root+'dist/__deployment.json','utf8'));
assert.equal(metadata.assetMode,'r2','Run an R2 build before this test');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
let fixture,browser,page;
const output=resolve(process.env.WEB_QA_OUTPUT||'/tmp/wow-vite-qa');await mkdir(output,{recursive:true});
try{
 fixture=await residentBrowserFixture(metadata);
 const {origin,save,credentials}=fixture;
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const cdn=new URL(metadata.assetBase).origin,requests=[],errors=[],failed=[],apiFailures=[],localRequests=[],streamErrors=[];let stream=null,streamMessages=0;
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
 page.on('request',request=>{if(request.url().includes('/api/game/local'))localRequests.push(request.url());});
 page.on('response',async response=>{if(response.url().includes('/api/')&&response.status()>=400&&!response.url().includes('/api/auth/session'))apiFailures.push({url:response.url(),status:response.status()});});
 page.on('websocket',socket=>{if(socket.url().includes('/api/events'))socket.on('framereceived',({payload})=>{try{const event=JSON.parse(String(payload));if(event.type==='heartbeat')return;stream=applyGameEvent(stream,event);streamMessages++;}catch(error){streamErrors.push(error.message);}});});
 const originAssets=[];page.on('request',req=>{const url=new URL(req.url());if(url.origin===origin&&!['/','/login','/model-viewer/index.html'].includes(url.pathname)&&!url.pathname.startsWith('/api/'))originAssets.push(url.pathname);});
 await page.goto(origin+'/login');await page.getByLabel('账号名称',{exact:true}).fill(credentials.username);await page.getByLabel('账号密码',{exact:true}).fill(credentials.password);
 assert.ok(!requests.some(url=>/\/game-[^/]+\.js/.test(url)),'login must not download game');
 await page.getByRole('button',{name:'登录并继续冒险'}).click();await page.waitForURL(origin+'/');
 await page.goto(origin+'/?saveId='+save.id);
 await page.getByText('服务器法师',{exact:true}).first().waitFor({timeout:60000});
 // Observe real authoritative changes after WebSocket subscription.
 for(let attempt=0;attempt<80&&(!stream?.execution||streamMessages<2||!stream.snapshot.player.totals.kills);attempt++)await new Promise(r=>setTimeout(r,500));
 assert.ok(stream?.execution?.instanceId,'server must establish a resident instance');
 assert.ok(streamMessages>=2,'server must stream ongoing authoritative updates');
 assert.ok(stream.snapshot.player.totals.kills>0,'server-owned hunting must produce a real kill');
 assert.deepEqual(localRequests,[],'client must never submit authoritative local checkpoints');
 assert.ok(!requests.some(url=>/local-simulation.worker|simulation-content\//.test(url)),'browser must not load the old simulation kernel');
 assert.deepEqual(streamErrors,[]);assert.deepEqual(apiFailures,[]);
 if(process.env.WEB_QA_DELAY)await new Promise(r=>setTimeout(r,Number(process.env.WEB_QA_DELAY)));
 const loot=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'战利品',exact:true})});
 if(await loot.isVisible()){
  await loot.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('[data-slot="dialog-overlay"]').waitFor({state:'detached'});
 }
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('tab',{name:'游戏',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:output+'/engine-settings-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:/返回游戏/}).click();
 await page.getByRole('button',{name:'打开世界地图',exact:true}).click();
 await page.getByRole('button',{name:'关闭窗口',exact:true}).click();
 await page.screenshot({path:output+'/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(originAssets,[],'only HTML and API may hit Zeabur');
 await writeFile(output+'/result.json',JSON.stringify({requests,errors,originAssets,failed,apiFailures,streamMessages,localRequests,streamErrors},null,2));
 console.log(`Browser smoke passed: login, save, ${requests.length} CDN loads, server authority, WebSocket, no client checkpoints, desktop/mobile. Screenshots: ${output}`);
}catch(error){if(page){await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});console.error((await page.locator('body').innerText().catch(()=>'')));}throw error;}finally{await browser?.close();await fixture?.close();}
