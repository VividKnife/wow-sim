import {stats} from './character.js';
import {effectsFor} from './battle-presentation.js';
import {sceneCombatArea,nearestCombatPoint} from './combat-area.js';
import {requiredRaidRoom,raidPreparationBoss,raidGridPoint} from './raid-room-layout.js';
import {dungeonDefinition,dungeonRoute} from './dungeon-registry.js';
import {raidNameFor,raidBossesFor} from './molten-core-content.js';

// Validate authored room geometry once; projection reads never bake navigation.
const preparationRooms=Object.fromEntries([...raidBossesFor('molten-core'),...raidBossesFor('onyxias-lair'),...raidBossesFor('azuregos'),...raidBossesFor('kazzak')].map(b=>[b.id,requiredRaidRoom(b.id)]));
const appearanceKeys=['id','name','classId','raceId','gender','level','form','stance','kind','entry','petUnit','totemUnit','ownerId','hp','mana','rage','energy','power','polyUntil'];
const appearance=unit=>Object.fromEntries(appearanceKeys.filter(k=>unit[k]!==undefined).map(k=>[k,unit[k]]));
// A scene outlives individual encounters. This is a public preparation tableau,
// not pathfinding coordinates or a fabricated combat/lastCombat record.
export function instancePresentation(s){
 if(s.combat||!s.dungeon&&!s.goldRaid?.active)return null;
 const raid=s.goldRaid?.active?s.goldRaid:null,d=s.dungeon;
 const room=raid?raid.locationId||'entrance':d.locationId;
 const name=raid?raidNameFor(raid.raidId):dungeonDefinition(d.id).name;
 const node=d?dungeonRoute(s).find(n=>n.id===room):null;
 const base=sceneCombatArea({dungeon:true,routeId:room});
 const id=raid?`${s.id}:raid:${raid.raidId}:${raid.serial}`:d.runId;
 const preparationBoss=raid?raidPreparationBoss(raid):null;
 const area=preparationRooms[preparationBoss]||null,assembly=area?.anchors.assembly||{x:0,y:0};
 const owners=[s,...s.party],columns=owners.length>5?8:5,rows=Math.ceil(owners.length/columns);
 const units=[];
 for(const [i,actor]of owners.entries()){
  const st=stats(actor),p=area?raidGridPoint(area,assembly,i,owners.length):{x:assembly.x+(i%columns-(Math.min(columns,owners.length)-1)/2)*5,y:assembly.y+(Math.floor(i/columns)-(rows-1)/2)*5},position=p.x,positionY=p.y;
  const activity=s.activity,activityCast=(activity.caster||s.id)===actor.id&&activity.spell&&activity.endsAt>s.clock&&['classSpell','classChannel','conjure','resurrect'].includes(activity.type)?{spell:activity.spell,target:activity.target||actor.id,startedAt:activity.startedAt,until:activity.endsAt}:null;
  const cast=actor.cast?.until>s.clock?{spell:actor.cast.spell,target:actor.cast.target,startedAt:actor.cast.startedAt??s.clock,until:actor.cast.until}:activityCast;
  units.push({...appearance(actor),maxHp:st.maxHp,maxMana:st.maxMana,position,positionY,foe:false,cast,effects:effectsFor(actor,s.clock)});
  for(const companion of [actor.pet,...Object.values(actor.totems||{})].filter(c=>c&&(c.petUnit||c.totemUnit)&&!c.removed)){
   if(companion.totemUnit&&companion.until<=s.clock)continue;
   const slot=units.filter(u=>u.ownerId===actor.id&&(u.petUnit||u.totemUnit)).length;
   const p=nearestCombatPoint(area,{x:position+1.5+slot*.8,y:positionY+1.8});
   units.push({...appearance(companion),maxHp:companion.maxHp||stats(companion).maxHp,position:p.x,positionY:p.y,foe:false,effects:effectsFor(companion,s.clock)});
  }
 }
 const phase=raid?.phase==='draft'||raid?.phase==='recruiting'?'组建队伍':s.activity.type==='partyBuffs'?'补充增益':s.rest||['goldRecovery','resurrect','revive'].includes(s.activity.type)?'队伍休整':raid?.auctions?.some(a=>a.status==='open')?'分配战利品':raid?.phase==='settled'?'本团已结算':'等待指挥';
 return {id,kind:raid?'raid':'dungeon',roomId:room,name,roomName:area?.name||node?.name|| (room==='entrance'?'副本入口':name),phase,clock:s.clock,memberCount:owners.length,
  ...(area?{area}:{}),ground:raid?(['azuregos','kazzak'].includes(raid.raidId)?'grass':raid.raidId==='onyxias-lair'?'onyxia':'molten'):base.ground||'cave',units};
}
