import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../src/rules/engine.js';
import {addItem} from '../src/rules/character.js';
import {nodes} from '../src/rules/catalog.js';
import {recipes,professionRanks} from '../src/rules/profession-data.js';
import {professionView,recipeAvailability,resourceView,skinBeast} from '../src/rules/professions.js';
import {workshopView} from '../src/rules/workshop.js';
const fresh=()=>Object.assign(createGame('专业验收',71,0),{level:60,money:100000000});
const action=(s,a)=>act(s,a,s.wallAt);

test('engine and learning view enforce main slots, secondary slots and companion limits',()=>{
 let s=fresh();
 for(const id of ['alchemy','engineering','firstaid','cooking','fishing'])s=action(s,{type:'learnProfession',id});
 const before=structuredClone(s);
 assert.match(professionView(s).professions.find(p=>p.id==='mining').learningBlockedReason,/两个/);
 assert.throws(()=>action(s,{type:'learnProfession',id:'mining'}),/两个/);assert.deepEqual(s,before);
 assert.throws(()=>action(s,{type:'learnProfession',id:'alchemy'}),/已经/);
 s=fresh();s.growthPolicy='companion';
 for(const id of ['cooking','fishing'])s=action(s,{type:'learnProfession',id});
 assert.throws(()=>action(s,{type:'learnProfession',id:'firstaid'}),/两项/);
 s.professions.cooking.skill=50;s=action(s,{type:'upgradeProfession',id:'cooking'});
 assert.equal(s.professions.cooking.cap,150);
});

test('training accepts both factions cities and rejects wilderness without spending',()=>{
 for(const raceId of [1,2])for(const location of ['stormwind','orgrimmar']){
  let s=fresh();s.raceId=raceId;s.location=location;
  s=action(s,{type:'learnProfession',id:'alchemy'});assert.equal(s.professions.alchemy.skill,1);
 }
 const s=fresh();s.location='northwood';const before=structuredClone(s);
 assert.throws(()=>action(s,{type:'learnProfession',id:'alchemy'}),/城镇/);assert.deepEqual(s,before);
});

test('racial bonuses unlock recipes while displayed difficulty and actual skill gains use base skill',()=>{
 let s=fresh();s.raceId=7;s.professions.engineering={skill:15,cap:75};
 const r=recipes.find(r=>r.profession==='engineering'&&r.skill<=30&&r.yellow>15&&r.yellow<=30);
 assert.ok(r);assert.equal(recipeAvailability(s,r).color,'orange');assert.equal(recipeAvailability(s,r).skillUpChance,1);
 for(const m of r.materials)addItem(s,m.id,m.count);for(const id of r.tools)addItem(s,id);
 s=action(s,{type:'craft',id:r.id,count:1});assert.equal(s.professions.engineering.skill,16);
 const unlocked=recipes.find(r=>r.profession==='engineering'&&r.skill>16&&r.skill<=31);assert.ok(unlocked);
 assert.equal(recipeAvailability(s,unlocked).known,true);
 s.professions.engineering.skill=49;assert.throws(()=>action(s,{type:'upgradeProfession',id:'engineering'}),/熟练度 50/);
 s.professions.engineering.skill=75;
 assert.equal(workshopView(s,{profession:'engineering',filter:'可提升'}).total,0);
 assert.equal(recipeAvailability(s,r).skillUpChance,0);
 const unavailable=recipes.find(r=>r.specialization);assert.equal(recipeAvailability(s,unavailable).color,'red');
});

for(const profession of ['alchemy','blacksmithing','leatherworking','tailoring','engineering','enchanting','cooking','firstaid']){
 test(`${profession} has an executable skill path 1–300 with rank and cap boundaries`,()=>{
  let s=action(fresh(),{type:'learnProfession',id:profession}),attempts=0;
  // Ingredients and tools are explicit fixtures: this validates the full skill
  // curve, not acquisition/economy (covered by durable account-order tests).
  while(s.professions[profession].skill<300){
   const p=s.professions[profession];
   if(p.skill===p.cap)s=action(s,{type:'upgradeProfession',id:profession});
   const r=recipes.filter(r=>r.profession===profession&&r.skill<=p.skill&&r.gray>p.skill&&!r.specialization&&!r.cooldown).sort((a,b)=>b.yellow-a.yellow)[0];
   assert.ok(r,`${profession} at ${p.skill}`);s.bag=[];
   for(const m of r.materials)addItem(s,m.id,m.count);for(const id of r.tools)if(!s.bag.some(i=>i.id===id))addItem(s,id);
   const before=s.professions[profession].skill,quote=recipeAvailability(s,r);
   s=action(s,{type:'craft',id:r.id,count:1});
   assert.ok(s.professions[profession].skill<=s.professions[profession].cap);
   if(quote.skillUpChance===1)assert.equal(s.professions[profession].skill,before+1);
   assert.ok(++attempts<3000,'bounded skill growth');
  }
  assert.equal(s.professions[profession].cap,professionRanks[profession].at(-1).cap);
  assert.equal(workshopView(s,{profession,filter:'可提升'}).total,0);
 });
}

test('herbalism and mining have accessible, skill-gaining resources throughout 1–300',()=>{
 for(const profession of ['herbalism','mining']){
  const s=fresh();s.professions[profession]={skill:1,cap:300};
  const resources=Object.keys(nodes).flatMap(location=>resourceView({...s,location})).filter(r=>r.profession===profession);
  for(let skill=1;skill<300;skill++)assert.ok(resources.some(r=>r.required<=skill&&skill<r.required+75),`${profession} at ${skill}`);
 }
});

test('fishing gains a point through 299 and stops at artisan cap while still yielding fish',()=>{
 let s=fresh();s.professions.fishing={skill:299,cap:300};s.location='mirror';
 for(let n=0;n<2;n++){
  s=action(s,{type:'gatherResource',id:'mirror:fish'});s=advance(s,s.wallAt+3000).state;
  assert.equal(s.professions.fishing.skill,300);
 }
 assert.ok(s.bag.some(i=>i.id===6291&&i.count>=2));
});


test('skinning progresses through 1–300, respects rank caps and only skins each beast once',()=>{
 let s=action(fresh(),{type:'learnProfession',id:'skinning'}),attempts=0;
 while(s.professions.skinning.skill<300){
  const p=s.professions.skinning;
  if(p.skill===p.cap){
   const beast={entry:299,level:Math.min(60,Math.floor(p.skill/5)+10),name:'测试野兽'};
   skinBeast(s,beast);assert.equal(p.skill,p.cap);
   s=action(s,{type:'upgradeProfession',id:'skinning'});
  }
  s.bag=[];const before=s.professions.skinning.skill;
  const beast={entry:299,level:Math.min(60,Math.floor(before/5)+10),name:'测试野兽'};
  skinBeast(s,beast);assert.equal(beast.skinned,true);
  const bag=structuredClone(s.bag),skill=s.professions.skinning.skill;
  skinBeast(s,beast);assert.equal(s.professions.skinning.skill,skill);assert.deepEqual(s.bag,bag);
  assert.ok(++attempts<3000);
 }
 assert.equal(s.professions.skinning.cap,300);
});
