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

// Phase is an authoritative property of a world, never a process-global toggle.
export const CONTENT_PHASES=Object.freeze([
 {phase:1,name:'经典启程',ready:true,features:['熔火之心','奥妮克希亚的巢穴','厄运之槌及 P1 专业商品']},
 {phase:2,name:'世界首领',ready:true,features:['艾索雷葛斯','卡扎克','P2 掉落、无底包及相关配方']},
 {phase:3,name:'黑翼之巢',ready:false,features:['后续内容尚未实现']},
 {phase:4,name:'祖尔格拉布',ready:false,features:['后续内容尚未实现']},
 {phase:5,name:'安其拉',ready:false,features:['后续内容尚未实现']},
 {phase:6,name:'纳克萨玛斯',ready:false,features:['后续内容尚未实现']},
]);
export const LATEST_CONTENT_PHASE=Math.max(...CONTENT_PHASES.filter(p=>p.ready).map(p=>p.phase));
export const contentPhase=s=>Number.isInteger(s?.contentPhase)&&s.contentPhase>=1&&s.contentPhase<=LATEST_CONTENT_PHASE?s.contentPhase:CURRENT_CONTENT_PHASE;
export const raidContentPhase=id=>['azuregos','kazzak'].includes(id)?2:1;
export const contentPhaseReason=(s,phase)=>contentPhase(s)<phase?`将在 P${phase} 开放，当前为 P${contentPhase(s)}`:'';
