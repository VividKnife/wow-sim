import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act} from '../../../packages/game-domain/src/rules/engine.js';
import {recruit,companionSkills} from '../../../packages/game-domain/src/rules/party.js';
import {arenaView} from '../../../packages/game-domain/src/rules/arena.js';
import {stats} from '../../../packages/game-domain/src/rules/character.js';
import {arenaBattleScene} from '../lib/arena-battle-scene.js';
import {battleObstacles,worldPoint,worldRadius,spriteAppearance,unitAnimation,groundTexture} from '../lib/battle-hd2d.js';

function fixture(){
 const s=createGame('Arena',123,0);s.level=20;s.learned=companionSkills(s);s.hp=stats(s).maxHp;
 recruit(s,'rogue',{role:'melee'});recruit(s,'priest',{role:'healer'});
 return act(s,{type:'arenaPrepare',size:3,mapId:'four-pillars',opponentId:'rmp',memberIds:[s.id,...s.party.map(c=>c.id)]},0);
}
test('arena projection drives the shared character sprites, casts, damage and polymorph animations',()=>{
 const s=fixture(),a=s.arena,hero=a.teams[0].members[0],enemy=a.teams[1].members[0];a.phase='combat';a.clock=4000;
 hero.cast={spell:116,target:enemy.id,startedAt:3000,until:5500};
 enemy.auras=[{spell:118,type:5,caster:hero.id,until:9000}];
 a.logs.push({id:1,at:4000,kind:'damage',actorId:hero.id,targetId:enemy.id,spellId:116,school:4,amount:80,critical:true,text:'damage'});
 const match=arenaView(s).match,scene=arenaBattleScene(match,{effects:match.logs.map(e=>({...e,shownAt:1000})),selectedId:enemy.id,wallAt:1000});
 assert.equal(scene.units.length,6);assert.equal(scene.live,true);assert.equal(scene.ground,'arena');
 assert.equal(scene.units[0].cast.spell,116);assert.equal(scene.units[0].cast.target,enemy.id);
 assert.equal(spriteAppearance(scene.units[0],4000).src,'/battle/hd2d/characters.png');
 assert.equal(spriteAppearance(scene.units[0],4000).row,3);
 const sheep=scene.units.find(c=>c.id===enemy.id);
 assert.equal(spriteAppearance(sheep,4000).src,'/battle/hd2d/forms.png');assert.equal(spriteAppearance(sheep,4000).row,2);
 assert.equal(unitAnimation(sheep,scene.effects,4000,1000,false),'polymorph');
 assert.equal(scene.effects[0].amount,80);assert.equal(scene.effects[0].critical,true);
 assert.ok(match.skills.some(s=>s.spellId===116&&s.icon&&s.school===4));
});
test('arena pillars align with simulation coordinates and radius at every zoom',()=>{
 const match=arenaView(fixture()).match;
 for(const zoom of [.5,1,3]){
  const scene=arenaBattleScene(match,{zoom}),pillars=battleObstacles(scene.layout);
  assert.equal(pillars.length,4);
  for(const [i,pillar]of pillars.entries()){
   const source=match.map.obstacles[i];assert.deepEqual(pillar.position,worldPoint(scene.layout,source));
   assert.equal(pillar.radius,worldRadius(scene.layout,source.radius));
   assert.ok(pillar.height>0);
  }
 }
 assert.equal(groundTexture('arena'),'/battle/ground/cave.webp');
});
test('undetected opponents and their retained visual effects never enter the character scene',()=>{
 const s=fixture(),a=s.arena,enemy=a.teams[1].members[0];a.phase='combat';a.clock=4000;enemy.stealthed=true;
 const match=arenaView(s).match,scene=arenaBattleScene(match,{selectedId:enemy.id,effects:[{id:1,kind:'cast',actorId:enemy.id,shownAt:1000}]});
 assert.equal(match.teams[1].members[0].hidden,true);assert.equal(match.teams[1].members[0].x,null);
 assert.ok(!scene.units.some(c=>c.id===enemy.id));assert.equal(scene.effects.length,0);assert.notEqual(scene.selectedId,enemy.id);
});
test('both teams retain unique projectile identities and a finished match freezes presentation time',()=>{
 const s=fixture(),a=s.arena;
 for(const [i,t]of a.teams.entries())t.projectiles=[{id:'same-sequence',actorId:t.members[0].id,targetId:a.teams[1-i].members[0].id,spellId:116,school:4,from:{x:i?10:-10,y:0},to:{x:i?-10:10,y:0},startedAt:4000,landsAt:5000}];
 a.phase='finished';a.clock=4500;
 const match=arenaView(s).match,scene=arenaBattleScene(match);
 assert.equal(new Set(match.projectiles.map(p=>p.id)).size,2);
 assert.equal(scene.live,false);assert.equal(scene.endClock,4500);
 assert.ok(match.projectiles.every(p=>p.actorId&&p.targetId&&p.spellId===116));
});
