/** Durable single-player state. Presentation history stays in the running Worker.
 * Build the projection before cloning so archived battles are never copied for
 * an upload. Do not remove projectiles, auras, RNG, metrics or lastCombat: these
 * are also consumed by combat, dungeon and gold-raid settlement rules. */
function actorCheckpoint(actor){
 const next={...actor};
 if('logs' in next)next.logs=[];
 if('battleHistory' in next)next.battleHistory=[];
 if(next.party)next.party=next.party.map(actorCheckpoint);
 if(next.arena)next.arena={...next.arena,logs:[]};
 if(next.battleground)next.battleground={...next.battleground,events:[],effects:[]};
 if(next.npcWorld)next.npcWorld={...next.npcWorld,residents:next.npcWorld.residents.map(resident=>({...resident,unit:actorCheckpoint(resident.unit)}))};
 return next;
}
export function projectLocalCheckpoint(state){return structuredClone(actorCheckpoint(state));}

/** Only persistence-assigned item identities need to travel back to the Worker.
 * Pair by submitted location, then apply by identity to the newer live state. */
export function itemIdentityChanges(submitted,canonical){
 const identities=new Map();
 const compare=(before,after)=>{
  if(!before||!after||typeof before!=='object'||typeof after!=='object')return;
  if(typeof before.uid==='string'&&typeof after.uid==='string'&&before.uid!==after.uid)identities.set(before.uid,after.uid);
  for(const key of Object.keys(before))if(key in after)compare(before[key],after[key]);
 };
 compare(submitted,canonical);
 return identities;
}
