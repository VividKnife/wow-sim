import type {ReadView,Row} from '../../persistence/src/store.ts';
import type {Rules} from './model.ts';
const definitionsCache=new WeakMap<ReadView,Promise<Row[]>>();
export function invalidateGmBuffCache(tx:ReadView){definitionsCache.delete(tx);}
// Wall-time definitions are projected onto each simulation clock. Historical
// windows remain available while an offline simulation catches up.
export async function applyGmBuffs(tx:ReadView,state:Rules,accountId:string,owners?:Map<string,string>,wallAt=state.wallAt) {
 let pending=definitionsCache.get(tx);
 if(!pending){pending=tx.list('gm_buffs');definitionsCache.set(tx,pending);}
 const definitions=await pending;
 const targeted=definitions.some(buff=>buff.scope==='player');
 const accounts=new Map<string,Rules>();
 for(const actor of [state,...state.party||[]]){
  const id=owners?.get(actor.id)||accountId;
  if(targeted&&!accounts.has(id))accounts.set(id,(await tx.get('accounts',id))||{});
  const userId=accounts.get(id)?.userId;
  actor.serverBuffs=[...(actor.serverBuffs||[]).filter((buff:Rules)=>!buff.gm),...definitions
   .filter(buff=>(buff.scope==='all'||buff.userId===userId)&&buff.endsWall>wallAt)
   .sort((a,b)=>a.id.localeCompare(b.id)).map(buff=>({
    id:buff.id,gm:true,name:buff.name,description:buff.description,icon:'/icons/class-assets/spell_holy_blessingofstrength.jpg',
    startsAt:state.clock+buff.startsWall-wallAt,until:state.clock+buff.endsWall-wallAt,
    ...buff.effects,
   }))];
 }
 return state;
}
export const buffSnapshot=(state:Rules)=>Object.fromEntries([state,...state.party||[]].map(actor=>[actor.id,actor.serverBuffs||[]]));
export function restoreBuffSnapshot(state:Rules,snapshot:Record<string,Rules[]>){
 for(const actor of [state,...state.party||[]])actor.serverBuffs=structuredClone(snapshot[actor.id]||[]);
}
