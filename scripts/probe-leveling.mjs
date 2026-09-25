// Deterministic, real-rule opening probe for every legal race/class pairing.
// It measures the first two levels, including local no-objective quests and
// actual combat. It deliberately makes no claim to finish levels 1-60.
import {writeFile, mkdir} from 'node:fs/promises';
import {createGame, act, advance, view} from '../packages/game-domain/src/rules/engine.js';
import {classDefinitions, raceDefinitions, monsterIdsAt, creatures} from '../packages/game-domain/src/rules/catalog.js';

const output=[];
for(const race of raceDefinitions)for(const cls of classDefinitions.filter(c=>c.races.includes(race.id))){
 let s=createGame('练级探针', 20260924, 0, {raceId:race.id,classId:cls.id});
 const opening=s.location;
 s=act(s,{type:'settings',autoLoot:true,autoLootIgnoreGray:true},s.wallAt);
 let quests=0, questXp=0;
 for(let i=0;i<20;i++){
  const q=view(s).quests.find(q=>q.canAccept&&q.objectives.length===0&&q.endLocations.includes(s.location)&&!q.repeatable);
  if(!q)break;
  try{s=act(s,{type:'accept',id:q.id},s.wallAt);const xp=s.totals.xp;s=act(s,{type:'turnin',id:q.id,choice:q.choices[0]?.id},s.wallAt);quests++;questXp+=s.totals.xp-xp;}
  catch{break;}
 }
 const monsters=monsterIdsAt(opening).map(id=>creatures[id]).filter(c=>c&&!c.Rank&&c.MinLevel<=2&&c.MaxLevel>=1).sort((a,b)=>a.MinLevel-b.MinLevel||a.Entry-b.Entry);
 const target=monsters[0]?.Entry;
 let reason='level 3';
 if(target&&s.level<3){
  s=act(s,{type:'hunt',id:target},s.wallAt);
  let loops=0;
  while(s.level<3&&s.wallAt<1_800_000&&loops++<40){
   const until=Math.min(1_800_000,s.wallAt+60_000);
   s=advance(s,until,{maxTicks:100000,stopWhen:x=>x.level>=3||x.hp<=0||x.activity.type==='idle'}).state;
   if(s.hp<=0){reason='died';break;}
   if(s.activity.type==='idle'){reason='stopped';break;}
  }
  if(s.level<3&&reason==='level 3')reason='timeout';
 }else if(!target)reason='no suitable starter monster';
 output.push({race:race.name,class:cls.name,raceId:race.id,classId:cls.id,opening,target,level:s.level,
  elapsedMin:+(s.wallAt/60000).toFixed(1),quests,questXp,kills:s.totals.kills,deaths:s.totals.deaths,reason});
 console.log(`${race.name}/${cls.name}: L${s.level} ${Math.round(s.wallAt/60000)}m, ${s.totals.kills} kills, ${reason}`);
}
await mkdir(new URL('../artifacts/leveling/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/leveling/opening-probe.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
