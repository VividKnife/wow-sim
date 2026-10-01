/**
 * Golden comparisons omit representation of the AI configuration cache and
 * the namespace added to old iN item IDs by the new runtime.
 * Configuration itself, decision clocks, accepted intents, RNG, assets and all
 * combat fields remain in the digest. The pinned reference stored a JSON string;
 * the new runtime stores explicit revisions instead. Item contents, location,
 * allocation counters and references remain compared; namespace uniqueness is
 * verified by the asset lifecycle tests, not this old single-room fixture.
 */
export function behaviorState(value: unknown): any {
 if(typeof value==='string'&&/^item:[^:]+:[1-9][0-9]*$/.test(value))return 'i'+value.slice(value.lastIndexOf(':')+1);
 if(Array.isArray(value))return value.map(behaviorState);
 if(!value||typeof value!=='object')return value;
 const result:Record<string,any>={};
 for(const [key,item]of Object.entries(value)){
  if(key==='strategyRevision')continue;
  result[key]=behaviorState(item);
  if((key==='policy'||key==='combatPolicy')&&result[key]?.slots){
   for(const slot of Object.values(result[key].slots) as Record<string,unknown>[]){
    delete slot.config;delete slot.configVersion;
   }
  }
 }
 return result;
}
