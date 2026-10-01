import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
import {classUtilityUse,classUtilityView} from '../../../packages/game-domain/src/rules/class-utility.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {diffProjectedState,applyProjectedState} from '../../../packages/contracts/src/events.ts';
import {targetSkillUses} from '../lib/skill-use-view.js';
import {actionAfterElapsed} from '../lib/classic-action-bar.js';

function fixture(){
 const s=createGame('共享冷却',37,0,{raceId:1,classId:8});s.level=60;s.clock=1000;s.learned=[11418,12051];
 s.globalCooldowns={133:2500};s.cooldowns={12051:10000};s.party=Array.from({length:39},(_,i)=>({...createGame(`同伴${i}`,i+1,0),id:`ally-${i}`}));
 return s;
}
test('one spell deadline reconstructs utility views for every raid target',()=>{
 const s=fixture(),view=classUtilityView(s),snapshot=projectClientSnapshot(s,view);
 assert.equal(view.skillUseReadyAt[11418],2500);assert.equal(view.skillUseReadyAt[12051],10000);
 assert.deepEqual(snapshot.view.skillUseReadyAt,view.skillUseReadyAt);
 for(const target of [s,...s.party])for(const spell of s.learned){
  const original=classUtilityUse(s,spell,target.id),restored=targetSkillUses(snapshot.view,target.id,s.clock)[spell];
  assert.deepEqual(JSON.parse(JSON.stringify(restored)),JSON.parse(JSON.stringify(original)));
  assert.equal(Object.hasOwn(snapshot.view.skillUsesByTarget[target.id][spell],'remaining'),false);
 }
});
test('elapsed time needs no per-target countdown patches and still obeys non-time blockers',()=>{
 const s=fixture(),before=projectClientSnapshot(s,classUtilityView(s));
 s.clock+=100;const after=projectClientSnapshot(s,classUtilityView(s));
 const patches=diffProjectedState(before,after);
 assert.ok(!patches.some(op=>op.path.includes('skillUseReadyAt')||op.path.includes('skillUsesByTarget')));
 assert.deepEqual(applyProjectedState(before,patches),after);
 const blocked=targetSkillUses(after.view,s.id,s.clock)[11418];
 assert.equal(blocked.remaining,1400);assert.equal(blocked.canUseAfterCooldown,false);
 assert.equal(actionAfterElapsed(blocked,2000).canUse,false,'missing materials cannot become usable when GCD expires');
 const sample={skillUsesByTarget:{hero:{1:{canUse:false,canUseAfterCooldown:true,reason:'技能尚未冷却'}}},skillUseReadyAt:{1:2500}};
 assert.equal(actionAfterElapsed(targetSkillUses(sample,'hero',1100)[1],1400).canUse,true);
 s.clock=10000;const expired=classUtilityView(s);assert.equal(expired.skillUseReadyAt[12051],0);
 assert.equal(targetSkillUses(expired,s.id,s.clock)[12051].remaining,0);
});
