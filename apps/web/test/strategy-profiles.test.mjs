import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,view} from '../../../packages/game-domain/src/rules/engine.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {MAX_STRATEGY_PROFILES,MAX_STRATEGY_RULES} from '../../../packages/sim-core/src/strategy-config.js';

const rule=(spell=133)=>({spell,condition:'healthBelow',value:45,enabled:true,and:[{condition:'manaAbove',value:25}]});
const config=()=>({rules:[rule()],policy:{role:'ranged',protectCC:false,waitForTank:false,pullDelaySeconds:5},autoBuffs:{enabled:true,armor:true,int:false,sta:false,targets:'self',refreshSeconds:60},potions:{enabled:true,health:45,mana:30,healthItem:0,manaItem:0}});
const command=(s,action)=>act(s,{type:'strategy',...action},s.wallAt);
const save=(s,name='单体',extra={})=>command(s,{operation:'saveProfile',name,...config(),...extra});

test('named configurations save drafts independently and load all member settings without changing team recovery',()=>{
 const start=createGame('保存策略',123,0),original=structuredClone(start.rules);
 let s=save(start);assert.deepEqual(s.rules,original);assert.equal(start.strategyProfiles.length,0);
 s=save(s,'群怪',{rules:Array.from({length:MAX_STRATEGY_RULES},()=>rule())});
 s=command(s,{rules:[]});
 s=command(JSON.parse(JSON.stringify(s)),{operation:'loadProfile',name:'单体'});
 assert.deepEqual(s.rules,config().rules);assert.deepEqual(s.strategyPolicy,config().policy);
 assert.deepEqual(s.autoBuffs,config().autoBuffs);assert.deepEqual(s.potions,config().potions);
 assert.deepEqual(s.settings,start.settings);assert.equal(s.strategyProfiles.length,2);
 s.rules[0].and[0].value=99;assert.equal(s.strategyProfiles[0].rules[0].and[0].value,25);
});

test('overwrite is explicit, validates before replacing, and deletion keeps the live configuration',()=>{
 let s=save(createGame('覆盖策略',124,0),' Boss ');const original=structuredClone(s);
 assert.equal(s.strategyProfiles[0].name,'Boss');
 assert.throws(()=>save(s,'boss'),/同名/);
 assert.throws(()=>save(s,'missing',{overwrite:true}),/找不到/);
 assert.throws(()=>save(s,'Boss',{overwrite:true,rules:[rule(2139)]}),/技能/);
 assert.deepEqual(s,original);
 s=save(s,'Boss',{overwrite:true,rules:[]});assert.equal(s.strategyProfiles.length,1);assert.deepEqual(s.strategyProfiles[0].rules,[]);
 s=command(s,{operation:'loadProfile',name:'Boss'});const active=structuredClone(s.rules);
 s=command(s,{operation:'deleteProfile',name:'Boss'});assert.deepEqual(s.rules,active);assert.deepEqual(s.strategyProfiles,[]);
 assert.throws(()=>command(s,{operation:'loadProfile',name:'Boss'}),/找不到/);
});

test('profiles use learned highest ranks and report unavailable skills without destroying the saved rules',()=>{
 let s=createGame('技能升级',125,0);s.learned.push(116);s=save(s,'练级',{rules:[rule(133),rule(116)]});
 s.learned=s.learned.filter(id=>id!==116);s.learned.push(143);
 const projected=projectClientSnapshot(s,view(s)).view.strategyMembers[0].strategyProfiles[0];
 assert.equal(projected.totalRules,2);assert.equal(projected.unavailableRules,1);assert.equal(projected.rules[0].spell,143);
 s=command(s,{operation:'loadProfile',name:'练级'});assert.deepEqual(s.rules,projected.rules);
 assert.deepEqual(s.strategyProfiles[0].rules.map(r=>r.spell),[133,116]);
 s.learned.push(116);s=command(s,{operation:'loadProfile',name:'练级'});assert.deepEqual(s.rules.map(r=>r.spell),[143,116]);
});

test('scheme names, operations and capacity are validated; full libraries can overwrite or delete',()=>{
 let s=createGame('方案校验',126,0);
 for(const name of ['',null,4,' '.repeat(4),'a'.repeat(41)])assert.throws(()=>save(s,name),/名称/);
 assert.throws(()=>command(s,{operation:'unknown',name:'x'}),/未知/);
 for(let i=0;i<MAX_STRATEGY_PROFILES;i++)s=save(s,`方案${i}`);
 assert.throws(()=>save(s,'超限'),/最多保存/);
 s=save(s,'方案0',{overwrite:true,rules:[]});assert.equal(s.strategyProfiles.length,MAX_STRATEGY_PROFILES);
 s=command(s,{operation:'deleteProfile',name:'方案0'});assert.equal(save(s,'空位').strategyProfiles.length,MAX_STRATEGY_PROFILES);
});

test('party members have separate libraries and strategy projection strips unrelated saved fields',()=>{
 let s=createGame('队长',127,0),other=createGame('队友',128,0);other.id='other';s.party=[other];
 s=save(s,'同名');s=save(s,'同名',{target:'other',rules:[]});
 assert.equal(s.strategyProfiles[0].rules.length,1);assert.equal(s.party[0].strategyProfiles[0].rules.length,0);
 s=command(s,{operation:'loadProfile',name:'同名',target:'other'});assert.equal(s.party[0].rules.length,0);
 s.strategyProfiles[0].secret='server only';s.strategyProfiles[0].policy.secret='server only';
 const projected=projectClientSnapshot(s,view(s));
 assert.equal(JSON.stringify(projected).includes('server only'),false);
 s.hp=0;assert.doesNotThrow(()=>save(s,'死亡仍可保存'));
});
