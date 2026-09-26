/** Persistence assigns IDs to new loot. Reconcile only identities into a newer
 * running simulation; never replace its HP, clocks or rewards with an older ACK. */
export function remapItemReferences(current, identities) {
 if(!identities.size)return current;
 const remap=value=>{
  if(!value||typeof value!=='object')return;
  for(const key of Object.keys(value)){
   if(typeof value[key]==='string'&&identities.has(value[key]))value[key]=identities.get(value[key]);
   else remap(value[key]);
  }
 };
 remap(current);
 return current;
}
