import {createGame,act,stats} from '../packages/game-domain/src/rules/engine.js';
import {enterDungeon} from '../packages/game-domain/src/rules/dungeon.js';
let fixture=createGame('刷新审计',812,0);fixture.level=30;fixture.location='stormwind';fixture.completed[900001]=true;
for(const id of ['warrior','priest','rogue','mage'])fixture=act(fixture,{type:'recruit',id},0);
fixture.location='stockades';fixture.hp=stats(fixture).maxHp;
const requirements={1706:10,1711:8,1715:8},minimum={1706:100,1711:100,1715:100};let shortRuns=0;const examples=[];
for(let seed=1;seed<=1000;seed++){
 const s=structuredClone(fixture);s.rngState=seed;enterDungeon(s,'stockades');
 const counts=Object.values(s.dungeon.spawns).filter(Boolean).reduce((o,m)=>(o[m.entry]=(o[m.entry]||0)+1,o),{});
 for(const id of Object.keys(requirements))minimum[id]=Math.min(minimum[id],counts[id]||0);
 if(Object.entries(requirements).some(([id,n])=>(counts[id]||0)<n)){shortRuns++;if(examples.length<10)examples.push({seed,counts});}
}
console.log(JSON.stringify({seeds:1000,requirements,minimum,shortRuns,examples},null,2));
