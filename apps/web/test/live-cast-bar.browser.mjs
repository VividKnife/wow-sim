import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';

// Exercise server-projected cast changes on the mobile HUD.
test('mobile cast HUD clears on completion and follows the next cast without overview polling',async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));
 const bundle=await build({absWorkingDir:web,stdin:{contents:`
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import LiveCastBar from './app/live-cast-bar';
  const cast={spell:585,startedAt:0,until:1500};
  const state={id:'hero',clock:1000,activity:{type:'combat'},combat:{id:'fight'},cast};
  const data={combatSkills:[{spellId:585,name:'惩击'}]};
  const root=createRoot(document.getElementById('root'));
  window.publish=(clock,cast,paused=false)=>root.render(<LiveCastBar state={{...state,clock,cast,combat:{id:'fight',command:{paused}}}} data={data}/>);
  window.publish(state.clock,cast);

 `,resolveDir:web,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const bar=page.getByRole('progressbar',{name:'惩击'});
  await bar.waitFor();
  await page.evaluate(()=>window.publish(1500,null));
  await bar.waitFor({state:'detached'});
  await page.evaluate(()=>window.publish(2000,{spell:585,startedAt:2000,until:3500},true));
  await bar.waitFor();
  assert.equal(await bar.getAttribute('aria-valuenow'),'0');
  await page.waitForTimeout(150);
  assert.equal(await bar.getAttribute('aria-valuenow'),'0');
  await page.evaluate(()=>window.publish(2750,{spell:585,startedAt:2000,until:3500},true));
  await page.waitForFunction(()=>document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')==='50');
  await page.evaluate(()=>window.publish(2800,null));
  await bar.waitFor({state:'detached'});
  // Mobile and desktop labels must fit the icon and complete short spell name.
  await page.setContent('<button class="hd2d-unit-label" style="position:absolute;top:150px;left:150px"><small class="hd2d-skill"><span class="hd2d-skill-placeholder">惩</span><span class="hd2d-skill-name">惩击</span></small></button>');
  await page.addStyleTag({content:await readFile(new URL('../app/battle-hd2d.css',import.meta.url),'utf8')});
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:844});
   const size=await page.locator('.hd2d-skill-name').evaluate(node=>({client:node.clientWidth,scroll:node.scrollWidth}));
   assert.ok(size.client>0);assert.equal(size.client,size.scroll);
  }
 }finally{await browser.close();}
});

test('stale overview cannot freeze utility GCD or a finished cast bar',async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));
 const bundle=await build({absWorkingDir:web,stdin:{contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import Bar from './app/classic-action-bar';import Progress from './app/activity-progress';
  const state={id:'hero',clock:1000,activity:{type:'idle'}};
  const skills=[{spellId:1243,name:'真言术：韧',known:true},{spellId:2050,name:'次级治疗术',known:true}];
  const data={skills,skillUses:{1243:{canUse:false,canUseAfterCooldown:true,remaining:1500,reason:'技能尚未冷却'},2050:{canUse:false,canUseAfterCooldown:false,remaining:1500,reason:'资源不足'}}};
  window.commands=[];
  createRoot(document.getElementById('root')).render(<div className="classic-game"><div className="cu-viewport" style={{height:800,position:'relative'}}><Bar state={state} data={data} busy={false} blocked={false} send={async(command)=>{window.commands.push(command);return true;}}/><Progress state={{...state,activity:{type:'classSpell',spell:1243,startedAt:1000,endsAt:2500}}} data={data} quartz/></div></div>);
 `,resolveDir:web,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({content:await readFile(new URL('../app/classic-action-bar.css',import.meta.url),'utf8')});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByRole('button',{name:'展开动作条'}).click();
  const ready=page.getByRole('button',{name:'1 号栏位：真言术：韧'}),blocked=page.getByRole('button',{name:'2 号栏位：次级治疗术'});
  assert.equal(await ready.getAttribute('aria-disabled'),'true');
  assert.ok(Number(await ready.locator('.cu-quick-cooldown').textContent())>0);
  // No snapshot or engine message follows for this entire test.
  await page.waitForFunction(()=>document.querySelector('.cu-quick-slot')?.getAttribute('aria-disabled')==='false',{},{timeout:2500});
  assert.equal(await ready.locator('.cu-quick-cooldown').count(),0);
  assert.equal(await blocked.getAttribute('aria-disabled'),'true');
  await page.getByRole('progressbar').waitFor({state:'detached',timeout:500});
  assert.equal(await page.getByText('等待完成').count(),0);
  await ready.click();assert.equal((await page.evaluate(()=>window.commands)).length,1);
  await page.waitForTimeout(4000);
  assert.equal(await ready.getAttribute('aria-disabled'),'false');
  assert.equal(await page.getByRole('progressbar').count(),0);
 }finally{await browser.close();}
});
