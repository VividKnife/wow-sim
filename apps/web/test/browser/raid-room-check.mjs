// Run against serve-raid-battlefield-preview.mjs. Exercises real worker snapshots and WebGL.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import rooms from '../../../../packages/game-data/data/boss-rooms.json' with {type:'json'};
const base=process.env.RAID_PREVIEW_URL||'http://127.0.0.1:5207';
const output=process.env.RAID_PREVIEW_OUTPUT||'/tmp/wow-raid-room-review';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],consoleErrors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 await page.goto(`${base}/battle-3d.html?boss=lucifron`,{waitUntil:'domcontentloaded'});
 await page.locator('[data-renderer="three"]').waitFor({timeout:90000});
   await page.waitForLoadState('networkidle',{timeout:90000});
   await page.waitForTimeout(1000);
 assert.equal(await page.locator('select,option').count(),0);
 const choose=async(label,value)=>{
  await page.getByRole('combobox',{name:label,exact:true}).click();
  await page.getByRole('option',{name:value,exact:false}).click();
 };
 for(const [bossId,room]of Object.entries(rooms)){
  if(bossId!=='lucifron')await choose('团本首领',room.name.split(' · ')[0]);
  for(const stage of ['battle','preparation']){
   if(stage==='preparation')await choose('场景阶段','战前集结');
   await page.waitForFunction(id=>document.querySelector('[data-testid="raid-room-summary"]')?.textContent.includes(id),room.id);
   await page.locator('[data-renderer="three"]').waitFor({timeout:90000});
   await page.waitForLoadState('networkidle',{timeout:90000});
   await page.waitForTimeout(1000);
   if(stage==='preparation')assert.equal(await page.locator('[data-member-count]').getAttribute('data-member-count'),'40');
   await page.waitForTimeout(250);
   await page.screenshot({path:join(output,`${bossId}-${stage}.png`),fullPage:true});
   results.push({bossId,stage,roomId:room.id,quality:'full',screenshot:join(output,`${bossId}-${stage}.png`)});
   console.log(`${bossId} ${stage}: ${room.id}`);
  }
 }
 for(const bossId of ['baron-geddon','ragnaros','onyxia']){
  await choose('团本首领',rooms[bossId].name.split(' · ')[0]);
  await page.getByRole('checkbox',{name:'简化特效',exact:true}).check();
  await page.waitForFunction(id=>document.querySelector('[data-testid="raid-room-summary"]')?.textContent.includes(id),rooms[bossId].id);
  await page.locator('[data-renderer="three"]').waitFor({timeout:90000});
   await page.waitForLoadState('networkidle',{timeout:90000});
   await page.waitForTimeout(1000);
  await page.screenshot({path:join(output,`${bossId}-low.png`),fullPage:true});
  results.push({bossId,stage:'battle',roomId:rooms[bossId].id,quality:'low',screenshot:join(output,`${bossId}-low.png`)});
 }
 await choose('场景阶段','深呼吸预警');
 await page.locator('[data-renderer="three"]').waitFor({timeout:90000});
   await page.waitForLoadState('networkidle',{timeout:90000});
   await page.waitForTimeout(1000);
 await page.screenshot({path:join(output,'onyxia-breath-low.png'),fullPage:true});
 results.push({bossId:'onyxia',stage:'mechanic',quality:'low',screenshot:join(output,'onyxia-breath-low.png')});
 await page.getByRole('checkbox',{name:'简化特效',exact:true}).uncheck();
 await page.screenshot({path:join(output,'onyxia-breath-full.png'),fullPage:true});
 results.push({bossId:'onyxia',stage:'mechanic',quality:'full',screenshot:join(output,'onyxia-breath-full.png')});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:join(output,'onyxia-mobile.png'),fullPage:true});
 results.push({bossId:'onyxia',stage:'mechanic',quality:'full',viewport:{width:390,height:844},screenshot:join(output,'onyxia-mobile.png')});
 assert.equal(await page.locator('select,option').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 await writeFile(join(output,'report.json'),JSON.stringify({results,errors,consoleErrors},null,2)+'\n');
 console.log(`Validated ${results.length} room/quality cases; screenshots: ${output}`);
}finally{await browser.close();}
