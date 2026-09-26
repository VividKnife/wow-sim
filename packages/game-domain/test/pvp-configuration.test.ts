import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../src/rules/engine.js';
import {newCharacter,stats,clone,knownRank} from '../src/rules/character.js';
import {createNpcMember,companionSkills} from '../src/rules/party.js';
import {talents,spells} from '../src/rules/catalog.js';
import {pvpPresets} from '../src/rules/pvp-presets.js';
import {recommendedPvpProfile,applyPvpProfile,validatePvpTalents,pvpConfiguration} from '../src/rules/pvp-profiles.js';
import {arenaTacticalTick} from '../src/rules/arena-tactics.js';
import {pvpApplyControl} from '../src/rules/pvp-runtime.js';
import {spellInfo} from '../src/rules/character.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Rules} from '../src/model.ts';

function roster(){const s:Rules=createGame('PvP captain',123,0);s.level=60;s.learned=companionSkills(s);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;createNpcMember(s,'warrior',{role:'tank'});createNpcMember(s,'priest',{role:'healer'});return s;}
function prepared(){const s=roster();return act(s,{type:'arenaPrepare',size:3,mapId:'courtyard',opponentId:'rmp',memberIds:[s.id,...s.party.map((c:Rules)=>c.id)]},0) as Rules;}
function tactical(){
 const s=prepared(),team=s.arena.teams[0],enemy=s.arena.teams[1].members;
 const root:Rules={clock:4000,logs:[],logSequence:0,combat:{pvp:true,enemies:enemy,startedAt:3000},party:team.members};
 for(const c of [...team.members,...enemy]){c.position=0;c.positionY=0;c.nextAction=0;c.baseRules=[];}
 const mage=team.members[0],control=enemy[2];control.position=15;enemy[0].position=5;enemy[1].position=10;
 team.plan.controlOrder=team.members.map((c:Rules)=>c.id);
 return{s,root,team,enemy,mage,control};
}
const rule=(c:Rules,name:string,condition='always')=>({spell:c.learned.find((id:number)=>spells[id]?.SpellName===name),condition,value:0,enabled:true});

test('nine classic PvP builds are legal at every level and spend exactly 51 points at 60',()=>{
 for(const preset of pvpPresets)for(let level=10;level<=60;level++){
  const c=newCharacter('tester',preset.classId,level);c.learned=companionSkills(c);
  const profile=recommendedPvpProfile(c,preset.id);validatePvpTalents(c,profile.talents);
  assert.equal(Object.values(profile.talents).reduce((sum:number,n:any)=>sum+n,0),level-9,`${preset.id}/${level}`);
  applyPvpProfile(c,profile);assert.ok(profile.rules.every((r:Rules)=>c.learned.includes(r.spell)));
 }
});
test('PvP builds replace talent grants on arena copies, leaving PvE talents, skills, gear and policies intact',()=>{
 const original=roster(),before=clone(original),p=act(original,{type:'arenaPrepare',size:3,mapId:'courtyard',opponentId:'rmp',memberIds:[original.id,...original.party.map((c:Rules)=>c.id)]},0);
 const fighter=p.arena.teams[0].members[1];assert.equal(fighter.strategyPolicy.role,'melee');assert.equal(fighter.talents[135],1);
 assert.ok(knownRank(fighter,12294),'Mortal Strike is granted only inside the arena');
 assert.ok(fighter.learned.some((id:number)=>spells[id]?.SpellName==='Mortal Strike'&&spells[id].SpellLevel>40),'talent spells use level-appropriate ranks');
 assert.deepEqual(p.talents,before.talents);assert.deepEqual(p.learned,before.learned);assert.deepEqual(p.party,before.party);assert.deepEqual(p.equipment,before.equipment);
});
test('saving a companion build updates preparation atomically, fences stale commands and stays isolated after combat',()=>{
 let s=prepared();const member=s.party[0],profile=recommendedPvpProfile(member);profile.name='护卫配置';profile.rules=profile.rules.map((r:Rules)=>({...r,enabled:false}));
 const adventure=clone(member);s=act(s,{type:'pvpConfigure',target:member.id,revision:0,profile},0);
 assert.equal(s.party[0].pvpProfile.name,'护卫配置');assert.equal(s.arena.planRevision,1);assert.equal(s.arena.teams[0].members[1].pvpProfileName,'护卫配置');
 assert.ok(s.arena.teams[0].members[1].baseRules.every((r:Rules)=>!r.enabled));assert.deepEqual(s.party[0].talents,adventure.talents);
 assert.throws(()=>act(s,{type:'pvpConfigure',target:member.id,revision:0,profile},0),/已变化/);
 assert.throws(()=>act(s,{type:'arenaStart',matchId:s.arena.id,revision:0,plan:s.arena.teams[0].plan},0),/修改/);
 s=act(s,{type:'arenaStart',matchId:s.arena.id,revision:1,plan:s.arena.teams[0].plan},0);
 assert.throws(()=>act(s,{type:'pvpConfigure',target:member.id,revision:1,profile},0),/锁定/);
 s=advance(s,8000).state;s=act(s,{type:'arenaSurrender',matchId:s.arena.id},s.wallAt);
 assert.deepEqual(s.party[0].talents,adventure.talents);assert.deepEqual(s.party[0].rules,adventure.rules);assert.equal(s.party[0].pvpProfile.name,'护卫配置');
});
test('invalid ownership, talent points, class, prerequisites and unlearned skills are rejected',()=>{
 const s=roster(),profile=recommendedPvpProfile(s);
 const save=(patch:Rules)=>act(s,{type:'pvpConfigure',target:s.id,revision:0,profile:{...profile,...patch}},0);
 assert.throws(()=>act(s,{type:'pvpConfigure',target:'foreign',revision:0,profile},0),/成员/);
 assert.throws(()=>save({talents:{135:1}}),/职业/);assert.throws(()=>save({talents:{71:1}}),/前置/);
 assert.throws(()=>save({talents:{37:99}}),/等级/);assert.throws(()=>save({talents:{37:1.5}}),/等级/);
 const all=Object.fromEntries(Object.values(talents).filter((t:any)=>t.classId===8).map((t:any)=>[t.id,t.maxRank]));assert.throws(()=>save({talents:all}),/上限/);
 assert.throws(()=>save({rules:[{spell:355,condition:'always',value:0,enabled:true}]}),/不能使用/);
});
test('PvP configuration is exposed for all owned members and never reveals enemy builds',()=>{
 const s=prepared(),v=view(s),snapshot=projectClientSnapshot(s,v);
 assert.equal((snapshot.view as Rules).pvp.members.length,3);assert.equal((snapshot.view as Rules).pvp.members[1].classId,1);
 assert.equal((snapshot.view as Rules).pvp.members[0].budget,51);assert.ok((snapshot.view as Rules).pvp.members.every((m:Rules)=>!m.id.startsWith('arena:1')));
});
test('a disabled CC skill is never injected by the commander; DR immunity and DoTs prevent wasted sheep',()=>{
 const {root,team,enemy,mage,control}=tactical();mage.baseRules=[{...rule(mage,'Polymorph'),enabled:false}];arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaControlTarget,null);
 mage.baseRules[0].enabled=true;arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaControlTarget,control.id);
 control.dots=[{remaining:3}];arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaControlTarget,null);
 control.dots=[];control.diminishing={polymorph:{count:3,endedAt:root.clock,active:false}};arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaControlTarget,null);
});
test('control order selects one caster and reserves ongoing control rather than overwriting it',()=>{
 const {root,team,enemy,mage,control}=tactical();mage.baseRules=[rule(mage,'Polymorph')];
 const second={...clone(mage),id:team.members[1].id};team.members[1]=second;team.plan.controlOrder=[second.id,mage.id,team.members[2].id];
 arenaTacticalTick(root,team,enemy);assert.equal(second.arenaControlTarget,control.id);assert.equal(mage.arenaControlTarget,null);
 second.cast={spell:second.baseRules[0].spell,target:control.id,until:root.clock+2000};arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaControlTarget,null);
 second.cast=null;pvpApplyControl(root,mage,control,spellInfo(mage,118),5,10000);arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaControlTarget,null);assert.equal(second.arenaControlTarget,null);
});
test('interrupt duties target the healer off focus and reserve one interrupter per cast',()=>{
 const {root,team,enemy,mage,control}=tactical();for(const a of team.plan.assignments){a.task='focus';a.interrupt='healer';}
 mage.baseRules=[rule(mage,'Counterspell','targetCasting')];const second={...clone(mage),id:team.members[1].id};team.members[1]=second;
 control.cast={spell:2061,startedAt:3000,until:7000};arenaTacticalTick(root,team,enemy);
 assert.equal(mage.arenaTargetId,enemy[0].id);assert.equal(mage.arenaInterruptTarget,control.id);assert.equal(second.arenaInterruptTarget,null);
 team.plan.assignments[0].interrupt='off';arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaInterruptTarget,null);assert.equal(second.arenaInterruptTarget,control.id);
});
test('each burst window closes with control; waiting has a finite configurable fallback',()=>{
 const {root,team,enemy,mage,control}=tactical();arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaWaitingBurst,true);
 pvpApplyControl(root,mage,control,spellInfo(mage,118),5,10000);arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaWaitingBurst,false);assert.equal(team.tacticalStatus,'爆发窗口');
 root.clock=15000;arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaWaitingBurst,true);
 root.clock=17000;arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaWaitingBurst,false);assert.match(team.tacticalStatus,/等待超时/);
});
test('a warrior without a shield cannot reserve an interrupt ahead of an eligible teammate',()=>{
 const {root,team,enemy,mage,control}=tactical(),warrior=team.members[1];
 control.position=3;control.cast={spell:2061,startedAt:3000,until:7000};
 warrior.stance='battle';warrior.rage=100;warrior.equipment={};warrior.baseRules=[rule(warrior,'Shield Bash','targetCasting')];
 mage.baseRules=[rule(mage,'Counterspell','targetCasting')];team.members=[warrior,mage,team.members[2]];
 for(const a of team.plan.assignments){a.task='focus';a.interrupt='healer';}
 arenaTacticalTick(root,team,enemy);assert.equal(warrior.arenaInterruptTarget,null);assert.equal(mage.arenaInterruptTarget,control.id);
});
test('the real arena pipeline interrupts an off-focus healer and locks its spell school',()=>{
 let s=prepared();s=act(s,{type:'arenaStart',matchId:s.arena.id,revision:0,plan:s.arena.teams[0].plan},0);
 s.arena.clock=4000;s.arena.rngState=12345;const team=s.arena.teams[0],enemy=s.arena.teams[1].members,mage=team.members[0],healer=enemy[2];
 for(const t of s.arena.teams)for(const c of t.members){c.baseRules=[];c.nextAction=100000;c.nextSwing=100000;c.position=-12;c.positionY=0;}
 for(const a of team.plan.assignments){a.task='focus';a.interrupt='healer';}
 mage.baseRules=[rule(mage,'Counterspell','targetCasting')];mage.nextAction=0;healer.position=-2;healer.cast={spell:585,target:mage.id,startedAt:3000,until:7000};
 s=advance(s,100).state;const target=s.arena.teams[1].members[2];
 assert.equal(target.cast,null);assert.ok(target.schoolLockouts[spells[2061].School]>4100);
 assert.ok(s.arena.logs.some((l:Rules)=>l.kind==='cast'&&l.spellId===2139&&l.targetId===healer.id));
});
test('kill priority follows death and immunity, while keeping the control target until last',()=>{
 const {root,team,enemy,mage}=tactical();team.plan.killOrder=[enemy[2].id,enemy[1].id,enemy[0].id];
 enemy[0].auras=[{type:39,misc:127,until:10000}];arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaTargetId,enemy[1].id);
 team.plan.swapOnImmunity=false;arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaTargetId,enemy[0].id);
 enemy[0].hp=0;arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaTargetId,enemy[1].id);
 enemy[1].hp=0;arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaTargetId,enemy[2].id);assert.equal(root.combat.controlTargetId,null);
});
test('protection directs a configured CC to the attacker threatening the assigned ally',()=>{
 const {root,team,enemy,mage}=tactical();team.plan.assignments[0].task='protect';mage.baseRules=[rule(mage,'Polymorph')];enemy[0].target=team.members[2].id;
 arenaTacticalTick(root,team,enemy);assert.equal(mage.arenaControlTarget,enemy[0].id);assert.match(mage.arenaIntent,/援护/);
});
test('service persists the player PvP profile while persistent NPCs prepare their own builds',async()=>{
 const store=new MemoryStore(),service=new GameService(store,{contentVersion:'pvp-test',now:()=>1000,seed:()=>123});
 const save=await service.createSave('pvp',{name:'leader',classId:8,raceId:1,raidReady:true},'profiles');
 const original=await service.command(save.id,{type:'npcRecommend',requestId:'group'});
 await service.command(save.id,{type:'pvpConfigure',target:original.state.id,revision:0,profile:recommendedPvpProfile(original.state),requestId:'config'});
 const restarted=new GameService(store,{contentVersion:'pvp-test',now:()=>1000}),restored=await restarted.snapshot(save.id);
 assert.equal(restored.state.pvpProfile.revision,1);assert.deepEqual(restored.state.talents,original.state.talents);
 assert.deepEqual(restored.state.npcWorld.residents,original.state.npcWorld.residents);
 const p=await restarted.command(save.id,{type:'arenaPrepare',size:5,mapId:'four-pillars',opponentId:'rmp',memberIds:[restored.state.id,...restored.state.npcWorld.selection],requestId:'prepare'});
 assert.equal(p.state.arena.teams[0].members.length,5);
 assert.equal(p.state.arena.teams[0].members.find((c:Rules)=>c.sourceId===restored.state.id).pvpProfileRevision,1);
 const after=await restarted.snapshot(save.id);assert.deepEqual(after.state.npcWorld.residents,original.state.npcWorld.residents);
});
