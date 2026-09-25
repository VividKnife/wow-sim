// Bounded level-18 Deadmines probe by class. Uses real dungeon/combat ticks.
// The leader receives the standard level-18 companion loadout for its class.
// This isolates combat pace; it does not validate trainer cost, class quests,
// or how a normal player obtains equivalent gear.
import {writeFile, mkdir} from 'node:fs/promises';
import {createGame, act, advance, stats} from '../packages/game-domain/src/rules/engine.js';
import {companionSkills} from '../packages/game-domain/src/rules/party.js';
import {classDefinitions} from '../packages/game-domain/src/rules/catalog.js';

const results=[];
for(const cls of classDefinitions){
 let s=createGame('副本探针',42,0,{raceId:cls.races[0],classId:cls.id});
 s.level=18;
 const template=cls.id===1?['warrior','tank']:cls.id===2?['paladin','melee']:cls.id===3?['hunter','ranged']:
  cls.id===4?['rogue','melee']:cls.id===5?['priest','healer']:cls.id===7?['shaman','melee']:
  cls.id===8?['mage','ranged']:cls.id===9?['warlock','ranged']:['druid','melee'];
 s=act(s,{type:'recruit',id:template[0],role:template[1]},0);
 const kit=s.party.pop();
 s.learned=companionSkills(s);
 s.equipment=structuredClone(kit.equipment);
 for(const item of Object.values(s.equipment))item.ownerId=s.id;
 s.talents=structuredClone(kit.talents);
 s.rules=structuredClone(kit.rules);
 s.strategyPolicy=structuredClone(kit.strategyPolicy);
 s.autoBuffs=structuredClone(kit.autoBuffs);
 s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 s.location='deadmines';
 s=act(s,{type:'settings',autoLoot:true,autoLootIgnoreGray:true},0);
 for(const [id,role] of [['warrior','tank'],['priest','healer'],['rogue','melee'],['mage','ranged']])
  s=act(s,{type:'recruit',id,role},0);
 s=act(s,{type:'enterDungeon',contentId:'deadmines'},0);
 s=act(s,{type:'dungeonNext'},0);
 for(let i=0;i<12;i++){
  s=advance(s,s.wallAt+60_000,{maxTicks:100_000,stopWhen:x=>x.dungeon?.completedAt||x.hp<=0||x.dungeon?.advanceReason||x.groupLoot?.pending?.length}).state;
  if(s.groupLoot?.pending?.length||s.dungeon?.completedAt||s.hp<=0||s.dungeon?.advanceReason)break;
 }
 const row={class:cls.name,classId:cls.id,raceId:cls.races[0],minutes:+(s.wallAt/60_000).toFixed(2),kills:s.totals.kills,xp:s.totals.xp,
  routeCursor:s.dungeon?.cursor,completed:!!s.dungeon?.completedAt,reason:s.dungeon?.advanceReason||'',dead:[s,...s.party].filter(x=>x.hp<=0).map(x=>x.roleId||'player')};
 results.push(row);console.log(JSON.stringify(row));
}
await mkdir(new URL('../artifacts/leveling/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/leveling/deadmines-probe.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
