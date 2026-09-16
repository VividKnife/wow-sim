import {nodes,creatureLocations,icon} from './catalog.js';
import {countItem,addItem,log} from './character.js';
import {stopRecovery} from './recovery.js';
import {leaveDungeon} from './dungeon.js';

// Innkeepers present in the imported region data: Farley, Allison, Heather.
const inns=new Set([295,6740,8931].flatMap(id=>creatureLocations[id]||[]));
export const hearthCastMs=10000;
export const hearthCooldownMs=3600000;
const destination=s=>nodes[s.hearth]?s.hearth:'northshire';
const available=s=>s.hp>0&&!s.combat&&['idle','hunt'].includes(s.activity.type);

export function hearthstoneView(s){
 const to=destination(s),remaining=Math.max(0,(s.hearthReady||0)-s.clock);
 const hasItem=countItem(s,6948)>0,hasInn=!s.dungeon&&inns.has(s.location);
 const here=!s.dungeon&&s.location===to;
 const reason=s.hp<=0?'角色已死亡':s.combat?'战斗中无法使用炉石':!['idle','hunt'].includes(s.activity.type)?'请先结束当前活动':!hasItem?'背包中没有炉石':remaining>0?'炉石冷却中':here?'已在绑定地点':'';
 return {destination:to,destinationName:nodes[to].name,icon:icon('items',6948),remaining,castMs:hearthCastMs,cooldownMs:hearthCooldownMs,hasItem,hasInn,canBind:hasInn&&available(s)&&(!here||!hasItem),canUse:!reason,reason};
}

export function bindHearth(s){
 if(!available(s))throw new Error('请先结束当前活动。');
 if(s.dungeon||!inns.has(s.location))throw new Error('只有在旅店老板处才能绑定炉石。');
 if(!countItem(s,6948)&&!addItem(s,6948,1,false))throw new Error('背包空间不足，无法领取炉石。');
 s.hearth=s.location;log(s,'炉石已绑定至 '+nodes[s.hearth].name,'travel');
}

export function beginHearth(s){
 if(!available(s))throw new Error('请先结束当前活动。');
 const h=hearthstoneView(s);if(!h.canUse)throw new Error(h.reason);
 stopRecovery(s);s.cast=null;
 s.activity={type:'hearth',from:s.location,to:h.destination,startedAt:s.clock,endsAt:s.clock+hearthCastMs};
 log(s,'使用炉石，正在返回 '+h.destinationName,'travel');
}

export function finishHearth(s){
 const to=s.activity.to;s.activity={type:'idle'};
 if(s.dungeon)leaveDungeon(s);
 s.location=to;if(!s.visited.includes(to))s.visited.push(to);
 s.hearthReady=s.clock+hearthCooldownMs;s.groundEffects=[];stopRecovery(s);
 log(s,'炉石将你带回 '+nodes[to].name,'travel');
}
