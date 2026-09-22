import {PROTOCOL_VERSION} from '../../../contracts/src/game.ts';
import {view,combatView} from './engine.js';
import {projectClientSnapshot} from './client-snapshot.ts';
import {CONTENT_VERSION} from './client-content.js';

const pick=(source,keys)=>source&&typeof source==='object'?Object.fromEntries(keys.filter(key=>Object.hasOwn(source,key)).map(key=>[key,source[key]])):null;
const accountView=account=>pick(account,['id','primaryCharacterId','partyId','revision']);
const rosterView=roster=>Array.isArray(roster)?roster.map(row=>pick(row,['id','characterId','name','classId','raceId','level','kind','talentSummary','professions','bagUsed','bagCapacity','location'])):[];
const activityView=activities=>Array.isArray(activities)?activities.map(row=>pick(row,['id','actorId','type','status','location','startedAt','settledUntil','nextEventAt','contentVersion','error'])):[];
const instanceView=instance=>{const result=pick(instance,['id','leaderId','contentId','status','capacity','sequence']);if(!result)return null;result.roster=Array.isArray(instance.roster)?instance.roster.map(row=>pick(row,['characterId','accountId','controller'])):[];return result;};
export function buildGameResponse(state,revision,extra={}){
 if(!Number.isSafeInteger(revision)||revision<0)throw new TypeError('revision must be a non-negative integer');
 const scope=extra.scope==='combat'&&state?.combat?'combat':'full';
 const payload={protocolVersion:PROTOCOL_VERSION,contentVersion:CONTENT_VERSION,revision,scope,snapshot:state==null?null:projectClientSnapshot(state,extra.view||(scope==='combat'?combatView(state):view(state)))};
 for(const key of ['replayed','instanceId','combatMode','playback','localSimulation'])if(Object.hasOwn(extra,key))payload[key]=extra[key];
 if(Object.hasOwn(extra,'account'))payload.account=extra.account==null?null:accountView(extra.account);
 if(Object.hasOwn(extra,'roster'))payload.roster=rosterView(extra.roster);
 if(Object.hasOwn(extra,'activities'))payload.activities=activityView(extra.activities);
 if(Object.hasOwn(extra,'instance'))payload.instance=instanceView(extra.instance);
 return Object.freeze(payload);
}
