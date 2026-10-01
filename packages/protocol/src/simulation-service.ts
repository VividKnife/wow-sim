import {validateSimulationInput,type SimulationInput} from './simulation.ts';

// Private gateway-to-host protocol. Never expose Admission on browser routes.
export type SimulationServiceRequest=
 | {operation:'deleteSave';userId:string;saveId:string}
 | {operation:'openCharacter';accountId:string;characterId:string}
 | {operation:'presentation';instanceId:string;accountId:string;actorId:string;scope:'full'|'combat';online:boolean}
 | {operation:'open';admission:{instanceId:string;state:Record<string,any>;controllers:{actorId:string;accountId:string;generation:number;canPause:boolean}[]}}
 | {operation:'input';accountId:string;input:SimulationInput}
 | {operation:'enterDungeon';accountId:string;input:SimulationInput}
 | {operation:'project';instanceId:string;full:boolean}
 | {operation:'checkpoint'|'remove';instanceId:string}
 | {operation:'inspect'};
function fields(value:any,names:string[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==names.length||names.some(key=>!Object.hasOwn(value,key)))throw new Error('Invalid service request fields');
}
function id(value:unknown,maximum=120){if(typeof value!=='string'||!value||value.length>maximum)throw new Error('Invalid service identifier');}
export function validateServiceRequest(value:SimulationServiceRequest){
 switch(value?.operation){
  case 'deleteSave':fields(value,['operation','userId','saveId']);id(value.userId,200);id(value.saveId,200);return;
  case 'openCharacter':fields(value,['operation','accountId','characterId']);id(value.accountId);id(value.characterId);return;
  case 'presentation':fields(value,['operation','instanceId','accountId','actorId','scope','online']);id(value.instanceId);id(value.accountId);id(value.actorId);if(typeof value.online!=='boolean'||!['full','combat'].includes(value.scope))throw new Error('Invalid presentation scope');return;
  case 'open':{
   fields(value,['operation','admission']);const a=value.admission;fields(a,['instanceId','state','controllers']);id(a.instanceId);
   if(!a.state||typeof a.state!=='object'||Array.isArray(a.state)||!Array.isArray(a.controllers)||a.controllers.length>40)throw new Error('Invalid admission');
   for(const c of a.controllers){fields(c,['actorId','accountId','generation','canPause']);id(c.actorId);id(c.accountId);
    if(!Number.isSafeInteger(c.generation)||c.generation<1||typeof c.canPause!=='boolean')throw new Error('Invalid controller');}
   return;
  }
  case 'input':case 'enterDungeon':fields(value,['operation','accountId','input']);id(value.accountId);validateSimulationInput(value.input);return;
  case 'project':fields(value,['operation','instanceId','full']);id(value.instanceId);if(typeof value.full!=='boolean')throw new Error('Invalid projection request');return;
  case 'checkpoint':case 'remove':fields(value,['operation','instanceId']);id(value.instanceId);return;
  case 'inspect':fields(value,['operation']);return;
  default:throw new Error('Unknown simulation operation');
 }
}
