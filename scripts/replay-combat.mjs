import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {advance,stats} from '../packages/game-domain/src/rules/engine.js';
import {distance} from '../packages/sim-core/src/geometry.js';

const [input,output,seconds='180']=process.argv.slice(2);
if(!input||!output||!Number.isFinite(Number(seconds))||Number(seconds)<=0)throw new Error('Usage: node scripts/replay-combat.mjs snapshot.json report.json [seconds]');
const snapshot=JSON.parse(await readFile(resolve(input),'utf8'));
let s=structuredClone(snapshot.simulation??snapshot);
if(!s.combat)throw new Error('Snapshot has no active combat');
const start=s.clock,encounter=s.combat.id,initial=structuredClone(s),events=[];
const origins=new Map([s,...s.party].map(c=>[c.id,{position:c.position,positionY:c.positionY}]));
const displacement={};let sequence=s.logSequence;
while(s.combat?.id===encounter&&s.clock-start<Number(seconds)*1000){
 s=advance(s,s.wallAt+Math.min(100,Number(seconds)*1000-(s.clock-start))).state;
 events.push(...s.logs.filter(l=>l.id>sequence));sequence=s.logSequence;
 for(const c of [s,...s.party])displacement[c.id]=Math.max(displacement[c.id]||0,distance(c,origins.get(c.id)));
}
const describe=c=>({id:c.id,name:c.name,hp:c.hp,mana:c.mana,maxMana:stats(c).maxMana,position:c.position,positionY:c.positionY});
const report={instanceId:snapshot.id,sequence:snapshot.sequence,encounter,elapsedSeconds:(s.clock-start)/1000,finished:s.combat?.id!==encounter,
 initialActors:[initial,...initial.party].map(describe),finalActors:[s,...s.party].map(describe),
 enemies:(s.combat||s.lastCombat)?.enemies?.map(e=>({id:e.id,name:e.name,hp:e.hp})),
 actors:[s,...s.party].map(c=>{const logs=events.filter(l=>l.actorId===c.id),damage=logs.filter(l=>l.kind==='damage');return{id:c.id,name:c.name,casts:logs.filter(l=>l.kind==='cast').length,cancels:logs.filter(l=>l.kind==='cancel').length,damage:damage.reduce((n,l)=>n+(l.amount||0),0),firstDamageSeconds:damage.length?(damage[0].at-start)/1000:null,maxDisplacement:displacement[c.id]||0};}),events};
await writeFile(resolve(output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,events:undefined},null,2));
