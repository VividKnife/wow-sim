// Focused runtime regression probes discovered during the world-content audit.
// Fixtures supply level/prerequisites; acceptance and actions use real rules.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {createGame,act} from '../packages/game-domain/src/rules/engine.js';
import {quests,questLinks,endpointNodes,monsterIdsAt,nodes} from '../packages/game-domain/src/rules/catalog.js';
import {questAvailable,questProgress,atEndpoint} from '../packages/game-domain/src/rules/quests.js';
import {addItem} from '../packages/game-domain/src/rules/character.js';

const results=[];
function check(name,fn){try{const evidence=fn();results.push({name,passed:true,evidence});}catch(e){results.push({name,passed:false,error:e.message});}}
function fixture(id,raceId=1,classId=1){
 const s=createGame('审计角色',73,0,{raceId,classId}),q=quests[id];s.level=60;
 if(q.PrevQuestId>0)s.completed[q.PrevQuestId]=1;
 s.location=(questLinks[id]?.starts||[]).flatMap(endpointNodes)[0];
 return s;
}
for(const [id,raceId,target] of [[505,1,2241],[1147,2,4130],[3063,2,5362],[4145,2,6509],[5097,1,10902]])check(`quest ${id}: accepted target ${target} has an executable action`,()=>{
 let s=act(fixture(id,raceId),{type:'accept',id},0);const p=questProgress(s,id),objective=p.objectives.find(o=>o.id===target);
 const targetIndex=[1,2,3,4].find(i=>quests[id]['ReqCreatureOrGOId'+i]===target);
 const scene=p.scenes.find(scene=>['objective:'+targetIndex,'encounter:'+targetIndex,'spell:'+targetIndex].includes(scene.key));
 const location=objective.locations.find(n=>monsterIdsAt(n).includes(target));
 assert.ok(location||scene?.locations.some(n=>nodes[n]),JSON.stringify({quest:id,target,locations:objective.locations,scenes:p.scenes.map(s=>s.key)}));
 if(location){s.location=location;act(s,{type:'hunt',id:target,quest:id},0);}
});
check('quest 2201: completed Uldaman necklace quest can be turned in',()=>{
 let s=act(fixture(2201),{type:'accept',id:2201},0);const q=quests[2201];
 for(let i=1;i<=4;i++)if(q['ReqItemId'+i])addItem(s,q['ReqItemId'+i],q['ReqItemCount'+i]);
 const p=questProgress(s,2201);assert.equal(p.complete,true);assert.ok(p.endLocations.length,'Quest is complete but has no turn-in location; gameobject 112877 is missing.');
 s.location=p.endLocations[0];assert.ok(atEndpoint(s,q,'ends'));act(s,{type:'turnin',id:2201,choice:p.choices[0]?.id},0);
});
check('quest 6625: Alliance Trauma accepts firstaid skill 225',()=>{
 const s=fixture(6625);s.professions.firstaid={skill:225,cap:225};
 assert.equal(questAvailable(s,quests[6625]),true,'Runtime profession is firstaid; quest requirement reads firstAid.');
});
check('quest 1641: unstarted human paladin book quest is available',()=>{
 const s=fixture(1641,1,2);assert.equal(questAvailable(s,quests[1641]),true,'Inventory/bank condition type 23 is not implemented.');
});
check('P1 excludes the Naxxramas entry chain offered in Eastern Plaguelands',()=>{
 const s=fixture(9121);s.reputation[529]=10000;
 assert.equal(questAvailable(s,quests[9121]),false,'Quest 9121 is available in P1 despite pointing to absent quest 9033.');
});
const directory=new URL('../artifacts/content-audit/',import.meta.url);await mkdir(directory,{recursive:true});
await writeFile(new URL('playability.json',directory),JSON.stringify(results,null,2)+'\n');
for(const r of results)console.log(`${r.passed?'PASS':'FAIL'} ${r.name}${r.error?'\n  '+r.error:''}`);
process.exitCode=results.some(r=>!r.passed)?1:0;
