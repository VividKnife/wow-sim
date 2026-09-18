// In-memory fixture only. No connection to player accounts or saved games.
import {createGame,act,advance,stats} from '../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../packages/game-domain/src/rules/combat.js';
import {abilities} from '../packages/game-domain/src/rules/catalog.js';
import {buildGameResponse} from '../packages/game-domain/src/rules/server-response.js';

let state=createGame('性能采样',283,0);
state.level=20;state.learned=abilities.filter(a=>a.requiredLevel<=20).map(a=>a.spellId);
state.hp=stats(state).maxHp;state.mana=stats(state).maxMana;
state.completed[900001]=1;state.location='stormwind';
 for(const id of ['warrior','priest','rogue','mage'])state=act(state,{type:'recruit',id},0);
startCombat(state,[636,636,1729],true);state=advance(state,500,{}).state;
const results={};
for(const scope of ['full','combat']){
 for(let i=0;i<5;i++)buildGameResponse(state,i,{scope});
 const elapsed=[];let bytes=0;
 for(let i=0;i<48;i++){
  const at=performance.now(),response=buildGameResponse(state,i,{scope});
  elapsed.push(performance.now()-at);bytes=Buffer.byteLength(JSON.stringify(response));
 }
 elapsed.sort((a,b)=>a-b);
 results[scope]={samples:elapsed.length,bytes,meanMs:+(elapsed.reduce((a,b)=>a+b)/elapsed.length).toFixed(2),p95Ms:+elapsed[Math.floor(elapsed.length*.95)].toFixed(2)};
}
console.log(JSON.stringify(results,null,2));
