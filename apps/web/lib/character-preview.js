import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
import {applyLevel20Boost} from '../../../packages/game-domain/src/rules/boost.js';
import {items} from '../../../packages/game-domain/src/rules/catalog.js';

// Read-only projection of the same initialization used when creating a save.
export function characterPreview(raceId,classId,boost){
 const state=createGame('预览',1,0,{raceId,classId});
 if(boost)applyLevel20Boost(state);
 const equipment=Object.fromEntries(Object.entries(state.equipment).map(([slot,item])=>[slot,{id:item.id}]));
 const catalog=Object.fromEntries(Object.values(equipment).map(({id})=>[id,{slot:items[id].InventoryType,appearanceItemId:items[id].appearanceItemId}]));
 return {raceId,classId,equipment,items:catalog};
}
