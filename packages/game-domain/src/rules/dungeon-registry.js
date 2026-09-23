import world from '../../../game-data/data/world-reference.json' with {type:'json'};
import localization from '../../../game-data/data/world-localization.json' with {type:'json'};
import deadmines from '../../../game-data/data/deadmines-reference.json' with {type:'json'};
import stockades from '../../../game-data/data/stockades-reference.json' with {type:'json'};

function worldEncounters(d){
 const encounters=d.reference.encounters.map(e=>({...e,nameZh:e.kind==='boss'?e.creatureTemplateIds.map(entry=>localization.npcs[entry]?.nameZhCN).filter(Boolean).join('、')||e.nameZh:e.nameZh}));
 if(d.id==='scarlet-monastery-cathedral'){
  const commander=encounters.find(e=>e.creatureTemplateIds.includes(3976)),inquisitor=encounters.find(e=>e.creatureTemplateIds.includes(3977));
  if(commander&&inquisitor){
   commander.nameZh+='与怀特迈恩';
   for(const key of ['creatureTemplateIds','sourceGuids','sourceSpawns'])commander[key]=[...commander[key],...inquisitor[key]];
   encounters.splice(encounters.indexOf(inquisitor),1);
  }
 }
 if(d.id==='blackrock-depths'){
  const champions=[9027,9028,9029,9030,9031,9032],announcer=encounters.find(e=>e.creatureTemplateIds.includes(10096));
  if(announcer){
   const sourceSpawns=[8925,8925,8925,8926,8926,8926,null].map((entry,i)=>({guid:'brd-arena-'+i,templateChoices:(entry?[entry]:champions).map(entry=>({entry}))}));
   const arena={...announcer,id:'brd-arena',kind:'event',nameZh:'秩序竞技场',interaction:{label:'报名挑战竞技场'},creatureTemplateIds:[8925,8926,...champions],sourceSpawns,sourceGuids:sourceSpawns.map(r=>r.guid),waves:[sourceSpawns.slice(0,3).map(r=>r.guid),sourceSpawns.slice(3,6).map(r=>r.guid),[sourceSpawns[6].guid]]};
   encounters.splice(encounters.indexOf(announcer),1,arena);
   for(let i=encounters.length-1;i>=0;i--)if(encounters[i]!==arena&&encounters[i].creatureTemplateIds.some(id=>champions.includes(id)))encounters.splice(i,1);
  }
  const bar=encounters.find(e=>e.creatureTemplateIds.includes(9502));
  if(bar){bar.interaction={label:'给罗克诺特送六杯黑铁啤酒',inputs:[[11325,6]]};bar.waves=[bar.sourceGuids];bar.nameZh='黑铁酒吧：法拉克斯';}
 }
 if(d.id==='dire-maul-north'){
  for(const e of encounters)if(e.creatureTemplateIds.some(id=>[14326,14322,14321,14323,14325,14324].includes(id)))e.optional=true;
  const king=encounters.find(e=>e.creatureTemplateIds.includes(11501));
  if(king)encounters.push({id:'gordok-tribute',nameZh:'戈多克贡品',kind:'event',sourceCentroid:king.sourceCentroid,creatureTemplateIds:[],sourceSpawns:[],sourceGuids:[],interaction:{label:'接受王位并开启贡品'},activation:{afterDeathEntry:11501}});
 }
 return encounters;
}

export const dungeonDefinitions=Object.freeze({
 ...Object.fromEntries(Object.entries(world.dungeons).map(([id,d])=>[id,{...d,reference:{...d.reference,encounters:worldEncounters({...d,id})}}])),
 deadmines:{id:'deadmines',name:'死亡矿井',zone:'西部荒野',entrance:'deadmines',minimumLevel:deadmines.entrance.minimumLevel,recommendedLevel:18,description:'深入迪菲亚兄弟会的秘密船坞，阻止范克里夫的复仇计划。',reference:deadmines,rareEntries:{3586:.2}},
 stockades:{id:'stockades',name:'暴风城监狱',zone:'暴风城',entrance:'stockades',minimumLevel:stockades.entrance.minimumLevel,recommendedLevel:26,description:'暴动的囚犯占据了监狱。进入牢房，镇压叛乱，追查迪菲亚阴谋的线索。',reference:stockades,rareEntries:{1720:.2}},
});
export function dungeonDefinition(id){
 if(typeof id!=='string'||!Object.hasOwn(dungeonDefinitions,id))throw new Error('未知或尚未开放的副本。');
 return dungeonDefinitions[id];
}
export function dungeonIdFor(s){return s.dungeon?.id||Object.values(dungeonDefinitions).find(d=>d.entrance===s.location)?.id||'deadmines';}
export function dungeonRoute(id){return dungeonDefinition(typeof id==='string'?id:dungeonIdFor(id)).reference.encounters;}
