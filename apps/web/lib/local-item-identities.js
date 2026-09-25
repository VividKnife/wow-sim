/** Persistence assigns IDs to new loot. Reconcile only identities into a newer
 * running simulation; never replace its HP, clocks or rewards with an older ACK. */
export function itemIdentityChanges(submitted, canonical) {
 const identities=new Map();
 const compare=(before,after)=>{
  if(!before||!after||typeof before!=='object'||typeof after!=='object')return;
  if(typeof before.uid==='string'&&typeof after.uid==='string'&&before.uid!==after.uid)identities.set(before.uid,after.uid);
  for(const key of Object.keys(before))if(key in after)compare(before[key],after[key]);
 };
 compare(submitted,canonical);
 return identities;
}
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
export function reconcileItemIdentities(current, submitted, canonical) {
 return remapItemReferences(current,itemIdentityChanges(submitted,canonical));
}
