import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
import {applyLevel20Boost} from '../../../packages/game-domain/src/rules/boost.js';
import {createRoster} from '../../../packages/game-domain/src/molten-core-roster.ts';
import {items} from '../../../packages/game-domain/src/rules/catalog.js';

// Read-only projection of the same initialization used when creating a save.
export function characterPreview(raceId,classId,level){
 if(![1,20,60].includes(level)||level===60&&(raceId!==1||classId!==8))throw new Error('无效的起始配置');
 const state=level===60?createRoster()[0]:createGame('预览',1,0,{raceId,classId});
 if(level===20)applyLevel20Boost(state);
 const equipment=Object.fromEntries(Object.entries(state.equipment).map(([slot,item])=>[slot,{id:item.id}]));
 const catalog=Object.fromEntries(Object.values(equipment).map(({id})=>[id,{slot:items[id].InventoryType,appearanceItemId:items[id].appearanceItemId}]));
 return {raceId,classId,equipment,items:catalog};
}
