import data from '../../../game-data/data/classic-bis.json' with {type:'json'};
import healers from '../../../game-data/data/classic-bis-healers.json' with {type:'json'};
import {items} from './catalog.js';
import {combatRole,dominantTalentTree} from './combat-roles.js';

// Membership in an authored loadout, not an item-level or stat-score ranking.
// Missing phases are deliberately not extended into the next content tier.
export const BIS_PHASES=data.phases;
export const CURRENT_BIS_PHASE=1;
const byItem=new Map();
for(const source of [data,healers])for(const row of source.entries){
 // Random suffixes are not represented in current item instances. Do not label the base item as BiS.
 if(items[row.itemId]?.RandomProperty||items[row.itemId]?.RandomSuffix)continue;
 const entries=byItem.get(row.itemId)||[];
 let entry=entries.find(e=>e.spec===row.spec);
 if(!entry){entry={spec:row.spec,...source.specs[row.spec],phases:[],sourceName:source.sourceName};entries.push(entry);}
 if(!entry.phases.some(p=>p.phase===row.phase))entry.phases.push({phase:row.phase,label:row.phase===0?'团本前':`P${row.phase}`,name:data.phases[row.phase],sourceUrl:source.sources[row.source].url});
 byItem.set(row.itemId,entries);
}
export function itemBis(id){return byItem.get(Number(id))||[];}
export function characterBis(c,itemId,phase=CURRENT_BIS_PHASE){
 const tree=dominantTalentTree(c),specMatches=e=>e.spec!=='mage-frost'||tree===61;
 return itemBis(itemId).filter(e=>specMatches(e)&&e.classId===c.classId&&e.role===combatRole(c)&&e.phases.some(p=>p.phase===phase));
}
