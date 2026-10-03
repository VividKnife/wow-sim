import {chromium} from 'playwright';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {CONTENT_PHASES} from '../../../../packages/game-domain/src/rules/content-phase.js';
const directory=await mkdtemp(tmpdir()+'/content-release-ui-');
const web=fileURLToPath(new URL('../../',import.meta.url));
await build({absWorkingDir:web,stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Admin from './app/admin';createRoot(document.getElementById('root')).render(<Admin/>);",resolveDir:web,loader:'tsx'},outfile:directory+'/app.js',bundle:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const server=createServer(async(req,res)=>{const asset=req.url==='/app.js'?'app.js':req.url==='/app.css'?'app.css':null;res.setHeader('content-type',asset?.endsWith('.js')?'text/javascript':asset?'text/css':'text/html');res.end(asset?await readFile(directory+'/'+asset):'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');});
server.listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));let phase=1,posts=0;
await page.route('**/api/admin/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path.endsWith('/session'))return route.fulfill({json:{admin:{id:'test-admin',username:'preview'},setupRequired:false}});
 if(path.endsWith('/content-release')){
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();assert.equal(body.phase,2);assert.equal(body.reason,'P2 测试开放');phase=2;posts++;}
  return route.fulfill({json:{phase,openedAt:phase===2?Date.now():null,phases:CONTENT_PHASES}});
 }
 return route.fulfill({json:{}});
});
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/admin`);
 await page.getByRole('button',{name:'版本开放',exact:true}).click();
 await page.getByRole('heading',{name:'当前开放 P1 · 经典启程'}).waitFor();
 const open=page.getByRole('button',{name:'确认全服开放 P2'});assert.equal(await open.isDisabled(),true);
 assert.equal(await page.locator('select').count(),0);
 await page.screenshot({path:directory+'/p1.png',fullPage:true});
 await page.getByRole('textbox',{name:'开放原因'}).fill('P2 测试开放');await open.click();
 await page.getByRole('heading',{name:'当前开放 P2 · 世界首领'}).waitFor();
 assert.equal(posts,1);assert.equal(await page.getByRole('button',{name:'确认全服开放 P2'}).count(),0);
 await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByRole('heading',{name:'当前开放 P2 · 世界首领'}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:directory+'/p2-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));assert.deepEqual(errors,[]);
 console.log('Admin release UI passed: disabled empty reason, P1 → P2, refresh, mobile, no native select. Screenshots: '+directory);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await rm(directory+'/app.js');await rm(directory+'/app.css');}
