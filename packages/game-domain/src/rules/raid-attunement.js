import {contentPhaseReason,raidContentPhase} from './content-phase.js';
import {countItem,addItem} from './character.js';

// The leader owns the account's entry progression; companions need no separate grind.
export function raidAttunementReason(s,id){
 const phaseReason=contentPhaseReason(s,raidContentPhase(id));if(phaseReason)return phaseReason;
 if(['azuregos','kazzak'].includes(id))return '';
 if(id==='onyxias-lair')return countItem(s,16309)>0||Object.values(s.equipment||{}).some(i=>i.id===16309)?'':'需要携带龙火护符，完成奥妮克希亚门任务。';
 return s.completed[7848]?'':'需要完成“熔火之心的传送门”任务。';
}
export function grantRaidReadyAttunements(s){s.completed[7848]=1;addItem(s,16309,1);}
