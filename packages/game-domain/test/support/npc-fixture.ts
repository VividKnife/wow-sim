import {newResident} from '../../src/rules/npc-world.js';
import type {Rules} from '../../src/model.ts';
/** Distinct public identities, explicitly assigned to each sealed test room. */
export function npcFixture(state:Rules,offset:number,count=10){
 state.npcWorld={publicPool:true,residents:Array.from({length:count},(_,i)=>newResident(state,offset+i,state.level)),selection:[],autoLoot:false,board:{ids:[],shown:{},sequence:0,refreshAt:0}};
}
