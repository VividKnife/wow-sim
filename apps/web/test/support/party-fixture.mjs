import {createNpcMember} from '../../../../packages/game-domain/src/rules/party.js';
export function recruitForTest(state,action,now){const result=structuredClone(state);result.level=Math.max(18,result.level);createNpcMember(result,action.id,action);return result;}
