import {moltenCoreRoute,raidRoutePlan,raidRouteLock} from './molten-core-content.js';

// Purchased gold-raid loot can wait in the delivery queue while the raid moves.
export function raidLootBlocksNavigation(s){return s.pending.some(item=>!s.goldRaid?.active||!item.raidSource?.startsWith('gold:'));}

export function navigateRaid(s,r,destination,launch){
 const path=raidRoutePlan(r,destination),lock=raidRouteLock(r,destination);
 if(lock)throw new Error(lock);
 if(!path.length)throw new Error('该区域已经清理。');
 if(raidLootBlocksNavigation(s))throw new Error('请先领取待拾取战利品。');
 if([s,...s.party].some(c=>c.hp<=0))throw new Error('有成员倒下，请先全团休整。');
 r.destination=destination;r.autoAdvance=true;
 advanceRaid(s,r,launch,true);
}
export function advanceRaid(s,r,launch,confirmed=false){
 if(!r?.active||!r.autoAdvance||s.combat||r.recoverUntil)return;
 if(raidLootBlocksNavigation(s)||[s,...s.party].some(c=>c.hp<=0)){pauseRaid(s,r,'领取战利品或休整复活后，在地图上继续推进。');return;}
 const next=raidRoutePlan(r,r.destination)[0];
 if(!next){pauseRaid(s,r,'已抵达目的地，区域清理完成。');return;}
 const lock=raidRouteLock(r,next);if(lock){pauseRaid(s,r,lock);return;}
 if(!confirmed&&moltenCoreRoute.find(n=>n.id===next)?.kind==='boss'){r.activeBoss=next;pauseRaid(s,r,'已抵达首领前。检查战前指挥与技能安排，再在地图上确认挑战。');return;}
 r.activeBoss=next;launch(next);s.combat.requiresManualControl=true;
 s.activity={type:'idle',reason:'团队正在清理'+moltenCoreRoute.find(n=>n.id===next).name};
}
export function pauseRaid(s,r,reason='已停止路线推进。'){
 r.autoAdvance=false;
 if(!s.combat&&!r.recoverUntil)s.activity={type:s.hp>0?'idle':'dead',reason};
}
export function settleRaidRoute(s,r,battle,won){
 const id=battle.raidEncounter.id,node=moltenCoreRoute.find(n=>n.id===id);
 if(won){const cleared=node.kind==='boss'?r.cleared:r.clearedPacks;if(!cleared.includes(id))cleared.push(id);r.locationId=id;}
 if(!won||id===r.destination||raidLootBlocksNavigation(s)||[s,...s.party].some(c=>c.hp<=0)||!raidRoutePlan(r,r.destination||id).length)r.autoAdvance=false;
 if(r.autoAdvance)s.activity={type:s.goldRaid?.active?'goldTravel':'raidTravel',endsAt:s.clock+3000,reason:'清理完成，团队正前往下一区域。'};
}
