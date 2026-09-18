import {act} from '../../../../packages/game-domain/src/rules/engine.js';
export function recruitForTest(state,action,now){
 const location=state.location;
 const ready=structuredClone(state);ready.level=Math.max(18,ready.level);ready.completed[900001]=1;ready.location='stormwind';
 const result=act(ready,action,now);result.location=location;return result;
}
