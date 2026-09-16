import test from 'node:test';
import assert from 'node:assert/strict';
import {recipes,professionRanks} from '../lib/game/profession-data.js';
import {createGame,act,stats} from '../lib/game/engine.js';
import {addItem,countItem,canEquip} from '../lib/game/character.js';
import {items} from '../lib/game/catalog.js';
import {recipeQuote,canDisenchant} from '../lib/game/professions.js';
const fresh=()=>{const s=createGame('大师工匠',71,0);s.level=60;s.money=1000000000;return s;};
const action=(s,a)=>act(s,a,s.wallAt);
const master=(id)=>{const s=fresh();s.professions[id]={skill:300,cap:300};return s;};

test('all Classic professions have artisan rank and endgame recipes',()=>{
 for(const id of ['alchemy','blacksmithing','leatherworking','tailoring','engineering','enchanting','cooking','firstaid','mining','herbalism','skinning','fishing'])assert.equal(professionRanks[id].at(-1).cap,300,id);
 assert.equal(recipes.length,1231);
 for(const spell of [16729,17187,18560,22704,22795,28210,20034,18630,24801,22967,28205,28207,28208,28209,28219,28220,28221,28222,28223,28224,28242,28243,28244])assert.ok(recipes.some(r=>r.spell===spell),String(spell));
 assert.ok(recipes.every(r=>r.skill>=1&&r.skill<=300));
 assert.equal(new Set(recipes.map(r=>r.spell)).size,recipes.length);
});

test('source ingredients, cooldowns and tools survive import',()=>{
 const arcanite=recipes.find(r=>r.spell===17187);
 assert.deepEqual(arcanite.materials,[{id:12359,count:1},{id:12363,count:1}]);
 assert.equal(arcanite.cooldown,172800000);assert.ok(arcanite.tools.includes(9149));
 assert.equal(recipes.find(r=>r.spell===18560).cooldown,345600000);
 const helm=recipes.find(r=>r.spell===16729);assert.equal(helm.skill,300);assert.equal(helm.specialization,9788);
 assert.ok(recipes.find(r=>r.spell===22704).tools.includes(6219));
});

test('artisan progression enforces each rank, level, skill and payment',()=>{
 let s=action(fresh(),{type:'learnProfession',id:'alchemy'});
 for(const rank of professionRanks.alchemy.slice(1)){
  s.professions.alchemy.skill=rank.skill-1;assert.throws(()=>action(s,{type:'upgradeProfession',id:'alchemy'}));
  s.professions.alchemy.skill=rank.skill;s.level=rank.level-1;assert.throws(()=>action(s,{type:'upgradeProfession',id:'alchemy'}));s.level=rank.level;
  const money=s.money;s=action(s,{type:'upgradeProfession',id:'alchemy'});assert.equal(s.professions.alchemy.cap,rank.cap);assert.equal(s.money,money-rank.cost);
 }
 assert.throws(()=>action(s,{type:'upgradeProfession',id:'alchemy'}),/300/);
});

test('transmute cooldown is shared, offline-clock based, and failures are atomic',()=>{
 let s=master('alchemy');s=action(s,{type:'craft',id:'spell-17187',count:1,buyMissing:true});assert.equal(countItem(s,12360),1);assert.equal(countItem(s,9149),1);
 const before=JSON.stringify(s);assert.throws(()=>action(s,{type:'craft',id:'spell-11479',count:1,buyMissing:true}),/冷却/);assert.equal(JSON.stringify(s),before);
 assert.throws(()=>action(s,{type:'craft',id:'spell-17187',count:2,buyMissing:true}),/一次/);
 s.clock+=172800000;s=action(s,{type:'craft',id:'spell-17187',count:1,buyMissing:true});assert.equal(countItem(s,12360),2);assert.equal(countItem(s,9149),1);
});

test('specialization requirements cannot be bypassed by material auto-buy',()=>{
 let s=master('blacksmithing');assert.throws(()=>action(s,{type:'craft',id:'spell-16729',count:1,buyMissing:true}),/专精/);
 s=action(s,{type:'specializeProfession',id:9788});s=action(s,{type:'craft',id:'spell-16729',count:1,buyMissing:true});assert.equal(countItem(s,12640),1);
 const gold=s.money;s=action(s,{type:'specializeProfession',id:9787});assert.equal(s.money,gold-50000);
 s=action(s,{type:'specializeProfession',id:17039});assert.throws(()=>action(s,{type:'craft',id:'spell-16729',count:1,buyMissing:true}),/专精/);
});

test('tools are preserved; superior rods substitute; facilities require a town',()=>{
 let s=master('enchanting');addItem(s,16207);s.bag.find(i=>i.id===16207).locked=true;
 const r=recipes.find(r=>r.spell===7420);assert.ok(recipeQuote(s,r).tools.every(t=>t.have));s=action(s,{type:'craft',id:r.id,count:2,buyMissing:true});assert.equal(countItem(s,16207),1);assert.equal(countItem(s,6218),0);
 s=master('tailoring');s.location='northwood';const before=JSON.stringify(s);assert.throws(()=>action(s,{type:'craft',id:'spell-18560',count:1,buyMissing:true}),/工坊/);assert.equal(JSON.stringify(s),before);
});

test('gray recipes never increase skills and orange crafts gain skill',()=>{
 let s=master('alchemy');s.professions.alchemy={skill:95,cap:150};s=action(s,{type:'craft',id:'spell-2330',count:20,buyMissing:true});assert.equal(s.professions.alchemy.skill,95);
 s.professions.alchemy={skill:1,cap:75};s=action(s,{type:'craft',id:'spell-2330',count:20,buyMissing:true});assert.equal(s.professions.alchemy.skill,21);
});

test('high tier disenchant uses source loot and bulk protects epics',()=>{
 let s=master('enchanting');addItem(s,12640);const epic=s.bag.find(i=>i.id===12640);assert.ok(canDisenchant(s,epic));
 assert.throws(()=>action(s,{type:'disenchantAll'}));assert.equal(countItem(s,12640),1);
 s=action(s,{type:'disenchant',uid:epic.uid});assert.equal(countItem(s,12640),0);assert.ok(countItem(s,20725)>0||countItem(s,14344)>0);
});

test('endgame stat enchants apply, replace, and retain slot/subclass restrictions',()=>{
 let s=fresh();s.level=20;addItem(s,920025,2);const base=stats(s),uid=s.equipment[5].uid;
 s=action(s,{type:'applyEnchant',id:920025,uid});assert.equal(stats(s).sta,base.sta+4);assert.equal(stats(s).int,base.int+4);
 s=action(s,{type:'applyEnchant',id:920025,uid});assert.equal(stats(s).sta,base.sta+4);
 addItem(s,920036);const before=JSON.stringify(s);assert.throws(()=>action(s,{type:'applyEnchant',id:920036,uid}));assert.equal(JSON.stringify(s),before);
});

test('specialist leatherworking recipes retain their trainer requirements',()=>{
 const expected={10619:10656,10621:10660,10630:10658,10632:10658,10647:10660,10650:10656};
 for(const [spell,spec]of Object.entries(expected))assert.equal(recipes.find(r=>r.spell===Number(spell)).specialization,spec,spell);
 assert.throws(()=>action(master('leatherworking'),{type:'craft',id:'spell-10621',count:1,buyMissing:true}),/专精/);
});

test('first aid is available to a level-one character and dodge scroll adds one percent',()=>{
 let s=fresh();s.level=1;s=action(s,{type:'learnProfession',id:'firstaid'});assert.equal(s.professions.firstaid.skill,1);
 s.level=20;addItem(s,2570);s.equipment[15]=s.bag.find(i=>i.id===2570);s.bag=s.bag.filter(i=>i.id!==2570);addItem(s,925086);const before=stats(s).dodge;
 s=action(s,{type:'applyEnchant',id:925086,uid:s.equipment[15].uid});assert.equal(stats(s).dodge,before+.01);
});

test('unique crafted items and market purchases cannot exceed the source limit',()=>{
 let s=master('alchemy');s=action(s,{type:'auctionBuy',id:4396,count:1});const before=JSON.stringify(s);assert.throws(()=>action(s,{type:'auctionBuy',id:4396,count:1}),/唯一/);assert.equal(JSON.stringify(s),before);
});

test('engineering equipment checks profession skill instead of rejecting all profession gear',()=>{
 const s=fresh();s.classId=8;const gun=items[10502];assert.equal(canEquip(s,gun),false);s.professions.engineering={skill:300,cap:300};assert.equal(canEquip(s,gun),true);
});
