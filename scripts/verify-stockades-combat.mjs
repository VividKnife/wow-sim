import {createNpcMember} from '../packages/game-domain/src/rules/party.js';
// Real combat route benchmark. Initial fixture grants level, learned ranks,
// companion equipment and supplies; no combatant HP or victory flags are changed.
import assert from 'node:assert/strict';
import {createGame,act,advance,stats,questProgress} from '../packages/game-domain/src/rules/engine.js';
import {companionSkills} from '../packages/game-domain/src/rules/party.js';
import {makeItem,addItem} from '../packages/game-domain/src/rules/character.js';
import {items,questItemIds,creatures} from '../packages/game-domain/src/rules/catalog.js';
import {dungeonRoute} from '../packages/game-domain/src/rules/dungeon.js';

const levels=process.argv.slice(2).map(Number);
for(const level of levels.length?levels:[60,30,26]){
 let s=createGame('监狱实战验证',812,0);s.level=level;s.completed[900001]=true;s.location='stormwind';
 for(const id of ['warrior','priest','rogue','mage'])createNpcMember(s,id);
 s.learned=companionSkills(s);s.equipment=structuredClone(s.party.find(c=>c.classId===8).equipment);
 s.bags=Array.from({length:4},()=>makeItem(s,14156));
 for(const c of [s,...s.party]){c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;}
 addItem(s,1205,200);addItem(s,4607,200);s.settings.autoLoot=true;
 for(const id of [377,378,386,387,388,391])s.quests[id]={kills:{},event:false,acceptedAt:0,expiresAt:0};
 s.location='stockades';s=act(s,{type:'enterDungeon',contentId:'stockades'},0);
 const spawnCounts=Object.values(s.dungeon.spawns).filter(Boolean).reduce((o,m)=>(o[m.entry]=(o[m.entry]||0)+1,o),{});
 const casts=new Set();let discarded=0,previous=0;
 s=act(s,{type:'dungeonNext'},0);
 for(let ticks=0;ticks<3600&&!s.dungeon.completedAt;ticks++){
  s=advance(s,s.wallAt+5000).state;
  for(const l of s.logs)if(l.spellId&&l.kind==='cast'&&l.actorId?.startsWith('stockades-'))casts.add(l.spellId);
  // Keep the benchmark focused on combat/recovery: dispose of non-quest loot
  // between encounters, without modifying combatants, source stats or rewards.
  if(!s.combat){const keep=i=>questItemIds.has(i.id)||[1205,4607].includes(i.id);discarded+=s.bag.filter(i=>!keep(i)).length+s.pending.filter(i=>!keep(i)).length;s.bag=s.bag.filter(keep);s.pending=s.pending.filter(keep);}
  if(!s.dungeon.completedAt&&!s.dungeon.autoAdvance&&!s.combat){if([s,...s.party].some(c=>c.hp<=0))break;s=act(s,{type:'dungeonNext'},s.wallAt);}
  if(s.dungeon.cursor!==previous){previous=s.dungeon.cursor;process.stderr.write(`level${level}: ${previous}/${dungeonRoute('stockades').length}\n`);}
 }
 const result={level,completed:!!s.dungeon.completedAt,cursor:s.dungeon.cursor,minutes:s.clock/60000,kills:s.totals.kills,deaths:s.totals.deaths,reason:s.dungeon.advanceReason,hp:[s,...s.party].map(c=>({classId:c.classId,hp:c.hp,maxHp:stats(c).maxHp})),spawnCounts,quests:Object.fromEntries([377,378,386,387,388,391].map(id=>[id,questProgress(s,id)?.complete])),discardedLootSlots:discarded,casts:[...casts]};
 console.log(JSON.stringify(result));
 if(level===60){assert.equal(result.completed,true);for(const [id,complete]of Object.entries(result.quests))assert.equal(complete,true,`quest${id}`);assert.equal(result.cursor,dungeonRoute('stockades').length);}
}
