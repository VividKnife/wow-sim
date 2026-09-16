// Continue a legitimately earned save using commands only, in a frozen engine snapshot.
import {mkdirSync,cpSync,readFileSync,readdirSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const web=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const input=resolve(process.argv[2]||'../../.cache/playthrough-snapshot-20/final-state.json');
const out=resolve(process.argv[3]||`../../.cache/content-playthrough-${Date.now()}`);
if(existsSync(out))throw new Error('Choose a fresh output directory.');
const runtime=resolve(out,'runtime');mkdirSync(runtime,{recursive:true});
for(const part of ['lib','data'])cpSync(resolve(web,part),resolve(runtime,part),{recursive:true});
mkdirSync(resolve(runtime,'scripts'),{recursive:true});
for(const name of ['continue-playthrough.mjs','replay-playthrough.mjs'])cpSync(resolve(web,'scripts',name),resolve(runtime,'scripts',name));
writeFileSync(resolve(runtime,'package.json'),JSON.stringify({type:'module',private:true}));
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)]);
writeFileSync(resolve(out,'source-manifest.json'),JSON.stringify(Object.fromEntries(files(runtime).map(p=>[relative(runtime,p).replaceAll('\\','/'),hash(readFileSync(p))])),null,2));
const moduleAt=name=>import(pathToFileURL(resolve(runtime,'lib/game',name)).href);
const {act,advance,stats,shop,view}=await moduleAt('engine.js');
const {items,spells,quests,abilities,monsterIdsAt,creatureLoot,creatures,nodes}=await moduleAt('catalog.js');
const {questProgress,gatherables}=await moduleAt('quests.js');
const {questTools}=await moduleAt('quest-tools.js');
const {countItem,knownRank,spellInfo,bagCapacity,canEquip,slotOf}=await moduleAt('character.js');
const {dungeonRoute,remainingDungeonEnemies}=await moduleAt('dungeon.js');
const {protectedItem}=await moduleAt('inventory.js');
const initial=readFileSync(input,'utf8');writeFileSync(resolve(out,'initial-state.json'),initial);
let s=JSON.parse(initial);const began=s.clock,originalDeaths=s.totals.deaths;
const journal=resolve(out,'commands.jsonl');writeFileSync(journal,JSON.stringify({type:'load',sha256:hash(initial),source:input})+'\n');
const record=row=>appendFileSync(journal,JSON.stringify(row)+'\n');
const report={input,initialSha256:hash(initial),quests:[],encounters:[],failures:[]};
function command(action){s=act(s,action,s.wallAt);record({type:'command',at:s.wallAt,action});}
function wait(ms){const now=s.wallAt+ms,options={dungeonOnline:true};let r;do{r=advance(s,now,options);s=r.state;}while(!r.complete);record({type:'advance',now,options});}
function finish(){let n=0;while((s.activity.endsAt||s.activity.type==='prepareDungeon')&&n++<2000)wait(s.activity.endsAt?Math.max(1,s.activity.endsAt-s.clock):100);if(n>=2000)throw new Error('Activity did not finish');}
function travel(to){if(s.location!==to){command({type:'travel',to});finish();}}
function members(){return [s,...s.party];}
function recover(){
 if(s.combat)throw new Error('Cannot recover during combat');
 if(s.activity.type==='hunt')command({type:'stop'});
 if([s,...s.party].some(c=>c.hp<=0)){command({type:'revive'});finish();}
 command({type:'rest'});let n=0;
 while(members().some(c=>c.hp<stats(c).maxHp||c.mana<stats(c).maxMana)&&n++<600)wait(2000);
 if(n>=600)throw new Error('Recovery exceeded twenty minutes');
}
function supplies(){for(const water of [false,true]){const id=knownRank(s,water?5504:587),sp=id&&spellInfo(s,id);if(!sp)throw new Error('Missing conjuration');let n=0;while(countItem(s,sp.EffectItemType1)<20&&s.bag.length<bagCapacity(s)&&n++<15){if(s.mana<sp.mana)recover();command({type:'conjure',water});finish();}}recover();}
function score(c,id){const i=items[id];if(!canEquip(c,i)||!i.InventoryType||c.classId===1&&i.InventoryType===17)return -1;let v=(i.armor||0)*(c.classId===1?.3:.03)+(i.dmg_min1+i.dmg_max1)/(i.delay/1000||1);for(let n=1;n<=10;n++)v+=(c.classId===1?{7:3,4:2}:c.classId===4?{3:3,7:2}:{5:3,6:2,7:2})[i['stat_type'+n]]*i['stat_value'+n]||0;return v;}
function equip(){for(const i of [...s.bag]){const slot=slotOf(items[i.id]);const c=[s,...s.party].filter(c=>(!i.ownerId||i.ownerId===c.id)&&score(c,i.id)>=0&&!(slot===17&&items[c.equipment[16]?.id]?.InventoryType===17)).sort((a,b)=>(score(b,i.id)-score(b,b.equipment[slot]?.id))-(score(a,i.id)-score(a,a.equipment[slot]?.id)))[0];if(c&&score(c,i.id)>score(c,c.equipment[slot]?.id))command({type:'equip',uid:i.uid,target:c.id});}}
function sell(){
 if(!shop(s).length)throw new Error('No vendor');
 const needed=new Set(Object.keys(s.quests).flatMap(id=>questProgress(s,+id).objectives.filter(o=>o.kind==='item').map(o=>o.id)));
 let keptLinen=false;
 for(const i of [...s.bag]){const data=items[i.id],aura=spells[data.spellid_1]?.EffectApplyAuraName1;if(i.id===2589&&!keptLinen){keptLinen=true;continue;}if(data.SellPrice&&!protectedItem(i)&&!needed.has(i.id)&&data.class!==12&&!data.startquest&&![84,85].includes(aura))command({type:'sell',uid:i.uid});}
 if(s.pending.length)command({type:'loot'});
}
function train(){let candidate;while((candidate=view(s).skills.find(a=>a.canTrain)))command({type:'train',id:candidate.spellId});report.unavailableSkills=view(s).skills.filter(a=>a.requiredLevel<=s.level&&!a.known&&!a.supported).map(a=>({id:a.spellId,name:a.name,reason:a.blockedReason}));}
function turnin(id){const q=questProgress(s,id);travel(q.endLocations[0]);const choice=[...q.choices].sort((a,b)=>score(s,b.id)-score(s,a.id))[0]?.id;command({type:'turnin',id,choice});report.quests.push(id);equip();}
function fight(id){supplies();command({type:'hunt',id});let n=0;while(!s.combat&&s.activity.type==='hunt'&&n++<6000)wait(100);if(!s.combat)throw new Error('Failed to pull: '+(s.activity.reason||'preparation timed out'));command({type:'stop'});n=0;while(s.combat&&n++<600)wait(1000);if(s.combat)throw new Error('Outdoor fight did not finish');return s.hp>0;}
try{
 if(process.argv.includes('--regional-tail')){
  if(s.combat){let seconds=0;while(s.combat&&seconds++<900)wait(1000);if(s.combat)throw new Error('Resumed encounter did not finish');}
  recover();if(s.dungeon)command({type:'leaveDungeon'});
  if(s.quests[214]&&questProgress(s,214).complete)turnin(214);
  travel('goldshire');equip();sell();supplies();
  // A random starter may not drop during the levelling route. Earn it from
  // its real loot source before accepting the item-started deed quest.
  if(!s.completed[184]){
   const target=Object.keys(nodes).flatMap(to=>monsterIdsAt(to).filter(id=>!creatures[id].Rank&&creatures[id].MaxLevel<=20&&(creatureLoot[creatures[id].LootId]||[]).some(r=>r.item===1972&&r.mincountOrRef>0)).map(entry=>({to,entry}))).sort((a,b)=>creatures[a.entry].MaxLevel-creatures[b.entry].MaxLevel)[0];
   let attempts=0;
   while(!s.quests[184]&&!countItem(s,1972)&&attempts++<300){
    if(!target)throw new Error('No supported source for Westfall Deed');
    if(s.pending.length||s.bag.length>=bagCapacity(s)-2){travel('goldshire');equip();sell();}
    travel(target.to);if(!fight(target.entry))throw new Error('Deed starter fight failed');
   }
   if(!s.quests[184])command({type:'accept',id:184});
   turnin(184);
  }
  if(!s.completed[16]){if(!countItem(s,159)){travel('goldshire');command({type:'buy',id:159,count:1});}travel('fargodeep');if(!s.quests[16])command({type:'accept',id:16});turnin(16);}
  for(const id of [3903,3904,3905,117]){
   if(s.completed[id])continue;
   let q=questProgress(s,id);travel(q.startLocations[0]);if(!s.quests[id])command({type:'accept',id});
   q=questProgress(s,id);let attempts=0;
   while(!q.complete&&attempts++<300){
    const objective=q.objectives.find(o=>o.count<o.required);if(!objective)throw new Error('Unknown regional objective');
    const target=objective.locations.flatMap(to=>monsterIdsAt(to).filter(entry=>(creatureLoot[creatures[entry].LootId]||[]).some(r=>r.item===objective.id&&r.mincountOrRef>0)).map(entry=>({to,entry}))).sort((a,b)=>creatures[a.entry].MaxLevel-creatures[b.entry].MaxLevel)[0];
    if(target){travel(target.to);if(!fight(target.entry))throw new Error('Regional fight failed');}
    else{travel(objective.locations[0]);const object=gatherables(s).find(o=>o.items.some(i=>i.id===objective.id));if(object){command({type:'gather',id:object.id});finish();}else wait(2000);}
    q=questProgress(s,id);
   }
   if(!q.complete)throw new Error('Regional objective limit reached: '+id);
   turnin(id);
  }
 }else if(process.argv.includes('--escort-only')){
  travel('goldshire');equip();sell();train();supplies();travel('sentinel');recover();
  const beganEscort=s.clock;command({type:'escortStart'});let seconds=0;
  while((s.escort||s.combat)&&seconds++<1800)wait(1000);
  report.escort={seconds:(s.clock-beganEscort)/1000,outcome:s.escortLast,remaining:!!s.escort};
  if(!s.quests[155]?.event)throw new Error('Escort did not reach the hideout');
  turnin(155);command({type:'accept',id:166});
 }else{
 if(process.argv.includes('--aftermath')){
  if(s.dungeon){recover();command({type:'leaveDungeon'});}
  travel('sentinel');if(!s.completed[214]&&!s.quests[214])command({type:'accept',id:214});
  if(!s.completed[373]&&!s.quests[373]&&countItem(s,2874)){command({type:'accept',id:373});turnin(373);}
  if(s.dungeonSave)command({type:'resetDungeon'});
 }
 if(s.combat){let seconds=0;while(s.combat&&seconds++<900)wait(1000);if(s.combat)throw new Error('Resumed encounter did not finish');}
 if(s.dungeon){recover();command({type:'leaveDungeon'});}
 if(s.hp<=0)recover();
 travel('goldshire');equip();sell();train();supplies();
 if(s.quests[1861]){travel('mirror');command({type:'useQuestItem',id:7207});finish();turnin(1861);}
 if(s.quests[1920]){
  travel('bluerecluse');let attempts=0;
  while(countItem(s,7292)<3&&attempts++<6){recover();command({type:'useQuestItem',id:7308});finish();let ticks=0;
   while(s.combat&&ticks++<6000){const capture=questTools(s).find(t=>t.id===7247&&t.available);if(capture){command({type:'useQuestItem',id:7247});finish();}wait(100);}
   if(s.combat||s.hp<=0)throw new Error('Rift encounter failed');
   for(const object of gatherables(s)){command({type:'gather',id:object.id});finish();}
  }
  turnin(1920);command({type:'accept',id:1921});
 }
 if(s.quests[1921]){
  travel('silverstream');let attempts=0;
  while(countItem(s,7249)<6&&attempts++<300){const object=gatherables(s).find(o=>o.items.some(i=>i.id===7249));if(object){command({type:'gather',id:object.id});finish();}else wait(2000);}
  turnin(1921);wait(10000);command({type:'accept',id:1941});turnin(1941);
 }
 travel('goldshire');sell();train();for(const id of ['warrior','priest','rogue','mage'])if(!s.party.some(c=>c.roleId===id))command({type:'recruit',id});
 const tank=s.party.find(c=>c.classId===1);
 if(process.argv.includes('--crowd-control'))travel('stormwind');
 for(const slot of [16,17]){const offer=shop(s).filter(o=>score(tank,o.id)>=0&&slotOf(items[o.id])===slot&&o.price<=s.money).sort((a,b)=>score(tank,b.id)-score(tank,a.id))[0];if(offer&&score(tank,offer.id)>score(tank,tank.equipment[slot]?.id)){command({type:'buy',id:offer.id,count:1});command({type:'equip',uid:s.bag.find(i=>i.id===offer.id).uid,target:tank.id});}}
 for(const c of [s,...s.party].filter(c=>c.classId===8))command({type:'strategy',target:c.id,policy:{protectCC:true,waitForTank:true},rules:[...(process.argv.includes('--crowd-control')?[{spell:118,condition:'always',value:0,enabled:true}]:[]),{spell:2136,condition:'targetHealthBelow',value:20,enabled:true},{spell:c===s?133:116,condition:'always',value:0,enabled:true}]});
 if(process.argv.includes('--crowd-control'))for(const c of [s,...s.party].filter(c=>[5,8].includes(c.classId)))command({type:'strategy',target:c.id,rules:c.rules||[{spell:585,condition:'always',value:0,enabled:true}],autoBuffs:{enabled:true,armor:true,int:true,sta:true,targets:'party',refreshSeconds:30}});
 supplies();travel('deadmines');command({type:'enterDungeon'});
 let iterations=0;const retries={};
 while(s.dungeon.cursor<dungeonRoute.length&&iterations++<200){
  const cursor=s.dungeon.cursor,e=dungeonRoute[cursor];recover();equip();
  if(s.pending.length||s.bag.length>bagCapacity(s)-6){command({type:'leaveDungeon'});travel('sentinel');sell();travel('deadmines');command({type:'enterDungeon'});}
  supplies();const beganFight=s.clock,deaths=s.totals.deaths;
  if(e.interaction&&!remainingDungeonEnemies(s,e).length){command({type:'dungeonInteract'});finish();continue;}
  command({type:'dungeonNext'});finish();let seconds=0;
  while(s.combat&&seconds++<900)wait(1000);
  if(s.combat)throw new Error('Dungeon fight exceeded fifteen minutes');
  const row={cursor,route:e.id,after:s.dungeon.cursor,seconds:(s.clock-beganFight)/1000,deaths:s.totals.deaths-deaths,alive:[s,...s.party].filter(c=>c.hp>0).length};report.encounters.push(row);console.log(JSON.stringify(row));
  if(s.dungeon.cursor===cursor&&!e.interaction&&(retries[cursor]=(retries[cursor]||0)+1)>=3)throw new Error('Three failed attempts on '+e.id);
 }
 if(!s.dungeon.completedAt)throw new Error('Dungeon did not complete');
 command({type:'leaveDungeon'});
 for(const id of Object.keys(s.quests).map(Number))if(questProgress(s,id).complete)turnin(id);
 // Finish remaining ordinary and elite outdoor objectives; scripted events are
 // reported separately rather than granting their completion flags.
 for(const id of Object.keys(s.quests).map(Number)){
  let q=questProgress(s,id);if(q.objectives.some(o=>o.kind==='event'))continue;
  let attempts=0;
  while(!q.complete&&attempts++<200){
   const objective=q.objectives.find(o=>o.count<o.required);
   const target=objective.locations.flatMap(to=>monsterIdsAt(to).filter(entry=>objective.kind==='kill'?entry===objective.id:(creatureLoot[creatures[entry].LootId]||[]).some(r=>r.item===objective.id&&r.mincountOrRef>0)).map(entry=>({to,entry})))[0];
   if(!target)break;
   if(s.pending.length||s.bag.length>=bagCapacity(s)-2){travel('goldshire');equip();sell();}
   travel(target.to);if(!fight(target.entry)){report.questFailures??=[];report.questFailures.push({id,entry:target.entry,at:s.clock});recover();break;}q=questProgress(s,id);
  }
  if(q.complete)turnin(id);
 }
 }
}catch(error){report.error=error.stack;report.failures=s.logs.slice(-60);console.error(error.message);process.exitCode=1;}
finally{
 report.final={level:s.level,seconds:(s.clock-began)/1000,deaths:s.totals.deaths-originalDeaths,money:s.money,cursor:(s.dungeon||s.dungeonSave)?.cursor,completedAt:(s.dungeon||s.dungeonSave)?.completedAt||null};
 writeFileSync(resolve(out,'final-state.json'),JSON.stringify(s));writeFileSync(resolve(out,'summary.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.final));
 const replay=spawnSync(process.execPath,[resolve(runtime,'scripts/replay-playthrough.mjs'),out],{stdio:'inherit'});if(replay.status!==0)process.exitCode=1;
}
