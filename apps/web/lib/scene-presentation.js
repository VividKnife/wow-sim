import backgrounds from '../../../packages/game-data/data/scene-backgrounds.json' with {type:'json'};
import {mapRegion,travelMapFrame} from './world-map.js';

export function activeInstance(state,data){
 if(data.goldRaid?.active)return {kind:'gold',view:data.goldRaid.map,raid:data.goldRaid};
 return state.dungeon?{kind:'dungeon',view:data.dungeon,raid:null}:null;
}

// The simulation commits location on arrival. This is a display-only sample of
// its timed road segments. Each road hands scenery over at its midpoint; this
// is deliberately not a claim of exact terrain/border collision coordinates.
export function scenePresentation(state,data,elapsed=0){
 const instance=activeInstance(state,data);
 if(instance){
  const dm=instance.view,location=dm?.route?.find(node=>node.id===dm.locationId);
  return {instance,region:dm?.name||instance.raid?.name||'副本',name:location?.name||'副本入口',image:backgrounds.dungeons[dm?.id||state.dungeon?.id]||null,location:data.location};
 }
 const journey=travelMapFrame(state,elapsed).journey;
 const id=journey.progress>=.5?journey.to:journey.from;
 const location=data.map?.find(node=>node.id===id)||data.location;
 const region=mapRegion(location?.region);
 return {instance:null,region,name:location?.name||'未知地点',image:backgrounds.regions[region]||null,location};
}

export function instanceActions(state,data){
 const instance=activeInstance(state,data);
 if(!instance)return null;
 const {kind,view:dm,raid}=instance,regular=kind==='dungeon',recovering=regular?!!state.rest||state.activity.type==='revive'||data.recovery?.members?.some(member=>member.restUntil>state.clock):!!raid.recovering;
 const recoverType=kind==='gold'?'goldRecover':'rest';
 const canRecover=regular?data.recovery?.canRest&&!recovering:!state.combat&&!recovering&&(kind!=='gold'||raid.phase==='camp');
 const revive=regular?{type:'revive'}:{type:recoverType};
 const dead=regular?(data.recovery?.fallen?.length||state.hp<=0):state.hp<=0||(state.party||[]).some(member=>member.hp<=0)||raid.members?.some(member=>member.hp<=0);
 const canRevive=regular?data.recovery?.canRevive:dead&&canRecover;
 return {
  recover:{command:{type:recoverType},disabled:!canRecover,label:recovering?'恢复中':'恢复',reason:state.combat?'战斗结束后才能恢复':recovering?'正在恢复':regular?'坐下恢复生命与法力':'全团复活与休整 · 10 秒'},
  revive:{command:revive,disabled:!canRevive,label:state.activity.type==='revive'?'跑尸中':regular?'跑尸':'全团复活',reason:state.combat?'战斗结束后才能返回尸体':dead?'复活倒下成员':'当前没有可复活的成员'},
  advance:{command:regular?{type:'dungeonNext'}:{type:kind==='gold'?'goldNavigate':'raidNavigate',destination:'full'},disabled:!!state.combat||!!dm?.autoAdvance||!(regular?dm?.canNext:dm?.canFullClear),label:dm?.autoAdvance?'推进中':'推进战斗',reason:dm?.nextReason||dm?.advanceReason||dm?.navigateReason||'沿副本路线推进；首领与路线选择可在地图中操作'},
 };
}
