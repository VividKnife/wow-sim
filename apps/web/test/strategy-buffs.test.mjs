import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats,view} from '../../../packages/game-domain/src/rules/engine.js';
import {companionSkills} from '../../../packages/game-domain/src/rules/party.js';
import {spellInfo,newCharacter,addItem} from '../../../packages/game-domain/src/rules/character.js';
import {ruleMatches,strategyAllows} from '../../../packages/game-domain/src/rules/combat-strategy.js';
import {prepareAutoBuffs} from '../../../packages/game-domain/src/rules/auto-buffs.js';
import {decideCompanion,stanceAllows} from '../../../packages/game-domain/src/rules/companion-combat.js';

test('strategies persist on the selected member and validate class and count threshold',()=>{
 let s=createGame('队长',41,0);s.level=20;s=act(s,{type:'recruit',id:'warrior'},0);
 const rules=[{spell:845,condition:'enemyCountAtLeast',value:3,enabled:true}];
 s=act(s,{type:'strategy',target:'companion-warrior',rules,policy:{protectCC:true,waitForTank:false}},0);
 assert.deepEqual(s.party[0].rules,rules);assert.notDeepEqual(s.rules,rules);
 assert.throws(()=>act(s,{type:'strategy',target:'companion-warrior',rules:[{...rules[0],spell:8078}]},0),/技能/);
 assert.throws(()=>act(s,{type:'strategy',rules:[{...rules[0],spell:133,value:0}]},0),/阈值/);
});

test('warriors learn legitimate Cleave only at level 20 and priests learn Fortitude',()=>{
 assert.ok(companionSkills({classId:1,level:20}).includes(845));
 assert.ok(!companionSkills({classId:1,level:19}).includes(845));
 assert.ok(!companionSkills({classId:1,level:20}).includes(8078));
 assert.ok(companionSkills({classId:5,level:12}).includes(1244));
});

test('pre-pull armor spends real mana and waits through its GCD without duplicate buffs',()=>{
 let s=createGame('增益',43,0);s.settings.health=1;s.settings.mana=1;
 s=act(s,{type:'strategy',rules:view(s).strategyMembers[0].rules,autoBuffs:{enabled:true,armor:true,int:false,sta:false,targets:'self',refreshSeconds:30}},0);
 const mana=s.mana,cost=spellInfo(s,168).mana;
 s=act(s,{type:'hunt',id:299},0);s=advance(s,100).state;
 assert.equal(s.combat,null);assert.equal(s.buffs.armor?.spell,168);assert.equal(s.mana,mana-cost);
 s=advance(s,1500).state;assert.equal(s.combat,null);
 s=advance(s,1600).state;assert.ok(s.combat);assert.equal(s.logs.filter(l=>l.kind==='buff').length,1);
});

test('stop during preparation cancels the pending hunt',()=>{
 let s=createGame('停止',47,0);s.autoBuffs={enabled:true,armor:true,int:false,sta:false,targets:'self',refreshSeconds:30};
 s=act(s,{type:'hunt',id:299},0);s=advance(s,100).state;s=act(s,{type:'stop'},100);s=advance(s,3000).state;
 assert.equal(s.combat,null);assert.equal(s.activity.type,'idle');
});

test('AOE thresholds count nearby enemies before target caps and protect nearby CC',()=>{
 const s=createGame('计数',49,0);s.position=0;s.positionY=0;
 const enemies=[1,2,3].map(n=>({id:'e'+n,hp:10,maxHp:10,position:n,positionY:0,threat:{}}));
 s.combat={enemies};const sp=spellInfo({...s,classId:1},845),rule={condition:'enemyCountAtLeast',value:3};
 assert.equal(ruleMatches(s,s,enemies[0],rule,sp),true);
 enemies[2].positionY=20;assert.equal(ruleMatches(s,s,enemies[0],rule,sp),false);
 enemies[2].positionY=0;enemies[2].polyUntil=1000;
 assert.equal(strategyAllows(s,s,enemies[0],sp),false);
 s.strategyPolicy={protectCC:false};assert.equal(ruleMatches(s,s,enemies[0],rule,sp),true);
});

test('AOE tank waiting checks every splash target and CC checks the fixed ground center after primary death',()=>{
 const s=createGame('范围策略',69,0);s.position=0;s.strategyPolicy={waitForTank:true,protectCC:true};
 const tank={id:'tank',classId:1,hp:100};s.party=[tank];
 const a={id:'a',hp:100,position:10,positionY:0,target:tank.id,threat:{[tank.id]:20}},b={id:'b',hp:100,position:11,positionY:0,target:s.id,threat:{}};
 s.combat={dungeon:true,enemies:[a,b]};const sp=spellInfo(s,2120);
 assert.equal(strategyAllows(s,s,a,sp),false);
 b.target=tank.id;b.threat[tank.id]=1;assert.equal(strategyAllows(s,s,a,sp),true);
 a.hp=0;b.polyUntil=1000;
 // A final sheep is intentionally attackable; keep another living enemy
 // outside the ground area to test protection of a genuine secondary target.
 s.combat.enemies.push({...a,id:'c',hp:100,position:50});
 assert.equal(strategyAllows(s,s,null,sp,undefined,{x:10,y:0}),false);
 b.position=30;assert.equal(strategyAllows(s,s,null,sp,undefined,{x:10,y:0}),true);
});

test('buff preparation refreshes expiring effects but never replaces a stronger live buff',()=>{
 const s=createGame('刷新',59,0);s.autoBuffs={enabled:true,armor:true,int:false,sta:false,targets:'self',refreshSeconds:30};
 s.buffs.armor={kind:'armor',amount:999,spell:7301,until:1000};const mana=s.mana;
 assert.equal(prepareAutoBuffs(s),false);assert.equal(s.mana,mana);
 s.buffs.armor={kind:'armor',amount:spellInfo(s,168).EffectBasePoints1+1,spell:168,until:30000};
 assert.equal(prepareAutoBuffs(s),true);assert.ok(s.buffs.armor.until>30000);
});

test('priest rescues an injured ally before damage count and tank-wait conditions',()=>{
 let s=createGame('救急',61,0);s.level=20;for(const id of ['warrior','priest'])s=act(s,{type:'recruit',id},0);
 const [tank,c]=s.party;tank.position=5;tank.hp=1;c.position=0;c.strategyPolicy={waitForTank:true,protectCC:true};c.rules=[{spell:585,condition:'enemyCountAtLeast',value:10,enabled:true}];
 const e={id:'e',hp:100,position:8,threat:{},target:s.id};s.combat={enemies:[e],casts:0};
 decideCompanion(s,c,[e],[s,...s.party],()=>{},()=>true,{});assert.equal(c.cast?.target,tank.id);assert.equal(c.cast?.friendly,true);
 assert.equal(stanceAllows({...tank,stance:'battle'},spellInfo(tank,355)),false);
 assert.equal(stanceAllows({...tank,stance:'defensive'},spellInfo(tank,355)),true);
});

test('explicit dungeon advance enters the room immediately even with automatic buffs enabled',()=>{
 let s=createGame('副本准备',67,0);s.level=18;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 for(const id of ['warrior','priest','rogue','mage'])s=act(s,{type:'recruit',id},0);
 s.location='deadmines';s=act(s,{type:'enterDungeon'},0);s.autoBuffs={enabled:true,armor:true,int:false,sta:false,targets:'self',refreshSeconds:30};
 s=act(s,{type:'dungeonNext'},0);assert.ok(s.combat);assert.equal(s.combat.pull.startsAt,3000);assert.equal(s.activity.type,'idle');
 s=advance(s,1600,{}).state;assert.equal(s.combat.pull.engagedAt,null);assert.equal(s.buffs.armor,undefined);
});

test('party preparation assigns shared buffs to the strongest caster without duplicate casts',()=>{
 const s=createGame('增益分工',51,0);s.level=20;s.learned.push(1459,1460);s.mana=stats(s).maxMana;s.dungeon={};
 const mage={...newCharacter('法师',8,10),id:'mage',learned:[1459],mana:1000,hp:100};s.party=[mage];
 for(const c of [s,mage])c.autoBuffs={enabled:true,armor:false,int:true,sta:false,targets:'party',refreshSeconds:30};
 prepareAutoBuffs(s);assert.equal(s.buffs.int?.spell,1460);s.clock=1500;prepareAutoBuffs(s);
 assert.equal(mage.buffs.int?.spell,1460);s.clock=3000;assert.equal(prepareAutoBuffs(s),false);
 assert.equal(s.logs.filter(l=>l.kind==='buff').length,2);assert.equal(mage.mana,1000);
});

test('insufficient buff mana waits for natural recovery without stopping the hunt',()=>{
 const s=createGame('法力',53,0);s.mana=0;s.bag=[];s.activity={type:'hunt',target:299};s.autoBuffs={enabled:true,armor:true,int:false,sta:false,targets:'self',refreshSeconds:30};
 assert.equal(prepareAutoBuffs(s),true);assert.equal(s.activity.type,'hunt');assert.equal(s.buffs.armor,undefined);
 const after=advance(s,30000).state;assert.ok(after.buffs.armor);assert.equal(after.activity.type,'hunt');
});

test('outdoor preparation finishes affordable buffs before drinking',()=>{
 let s=createGame('集中补增益',53,0);s.level=20;s.learned.push(1459);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 s.settings={health:1,mana:100,autoFood:true,autoWater:true};addItem(s,1205,20);
 s.autoBuffs={enabled:true,armor:true,int:true,sta:false,targets:'self',refreshSeconds:30};
 const initialMana=s.mana,cost=spellInfo(s,168).mana+spellInfo(s,1459).mana;
 s=act(s,{type:'hunt',id:299},0);s=advance(s,1600,{}).state;
 assert.equal(s.logs.filter(l=>l.kind==='buff').length,2);
 assert.equal(s.totals.water,0,'enough mana for both buffs without an intervening drink');
 assert.equal(s.mana,initialMana-cost);assert.equal(s.combat,null);
 s=advance(s,3200,{}).state;
 assert.equal(s.totals.water,1);assert.equal(s.combat,null);
 const events=s.logs.filter(l=>['buff','rest'].includes(l.kind));
 assert.deepEqual(events.map(e=>e.kind),['buff','buff','rest']);
});

test('warrior queues Cleave only at the configured count and never NPC Thunderclap',()=>{
 let s=createGame('顺劈',57,0);s.level=20;s=act(s,{type:'recruit',id:'warrior'},0);const c=s.party[0];c.position=0;c.positionY=0;c.rage=500;
 c.rules=[{spell:845,condition:'enemyCountAtLeast',value:3,enabled:true}];
 const enemies=[1,2,3].map(n=>({id:'e'+n,hp:100,position:n,positionY:0,threat:{},target:c.id}));s.combat={enemies,casts:0};
 decideCompanion(s,c,enemies,[s,c],()=>{},()=>true,{});assert.equal(c.queuedStrike,845);
 c.queuedStrike=null;enemies[2].positionY=20;decideCompanion(s,c,enemies,[s,c],()=>{},()=>true,{});assert.equal(c.queuedStrike,null);
});
