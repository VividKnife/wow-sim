// Changes happen at strategy input/creation boundaries, never by inspecting or
// serializing every actor's configuration on every policy step.
function equal(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a),other=Object.keys(b);
 return keys.length===other.length&&keys.every((key,i)=>key===other[i]&&equal(a[key],b[key]));
}
export function setCombatStrategy(actor,changes){
 const fields=['rules','strategyPolicy','potions'];
 const changed=fields.some(key=>Object.hasOwn(changes,key)&&!equal(actor[key],changes[key]));
 if(changed){
  const revision=(actor.strategyRevision||0)+1;
  if(!Number.isSafeInteger(revision))throw new RangeError('Strategy revision exhausted');
  actor.strategyRevision=revision;
 }
 for(const key of fields)if(Object.hasOwn(changes,key))actor[key]=changes[key];
 return changed;
}
