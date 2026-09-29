import reference from '../../../game-data/data/market-content-phases.json' with {type:'json'};
import {recipes} from './profession-data.js';

export const CURRENT_CONTENT_PHASE=reference.currentPhase;
const phases=new Map(Object.entries(reference.itemPhases).map(([id,phase])=>[Number(id),phase]));
const overridden=new Set();
for(const group of reference.groups)for(const id of group.items){
 if(overridden.has(id))throw new Error(`Duplicate content phase for item ${id}`);
 overridden.add(id);phases.set(id,group.phase);
}
// A recipe document cannot precede its product. Conversely, a delayed recipe
// must not delay a material that also has an earlier source (e.g. elemental fire).
for(const recipe of recipes){
 const phase=phases.get(recipe.item)||1;
 for(const id of recipe.recipeItems)phases.set(id,overridden.has(recipe.item)?phase:Math.max(phases.get(id)||1,phase));
}
export const itemContentPhase=id=>phases.get(Number(id))||1;
export const itemAvailableInPhase=(id,phase=CURRENT_CONTENT_PHASE)=>itemContentPhase(id)<=phase;
