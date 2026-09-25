// Read-only audit of the current runtime catalogue; results are candidates for
// review, not a claim that every imported Classic record is in product scope.
import {writeFile,mkdir} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {nodes,edges,route,quests,questLinks,endpointNodes,creatures,creatureLocations,items,spells,objectTemplates,objectLocations,monsterIdsAt,table,nameOf,flightNodes,flights} from '../packages/game-domain/src/rules/catalog.js';
import {questScenes,itemSources,questContentReason} from '../packages/game-domain/src/rules/quests.js';
import {supportedConditionTypes} from '../packages/game-domain/src/rules/quest-conditions.js';
import {dungeonDefinitions,dungeonRoute} from '../packages/game-domain/src/rules/dungeon-registry.js';
import {createGame} from '../packages/game-domain/src/rules/engine.js';
import {recipes,marketIds} from '../packages/game-domain/src/rules/profession-data.js';

const issues={};
const add=(kind,data)=>(issues[kind]??=[]).push(data);
const validLocations=locations=>(locations||[]).filter(id=>nodes[id]);
const questLabel=q=>({id:q.entry,name:nameOf('quests',q.entry),level:q.QuestLevel,zone:q.ZoneOrSort,excluded:!!questContentReason(q),scopeReason:questContentReason(q)});
const huntable=new Set(Object.keys(nodes).flatMap(monsterIdsAt));
const encounterEntries=new Set(Object.keys(dungeonDefinitions).flatMap(id=>dungeonRoute(id).flatMap(e=>e.creatureTemplateIds)));
// Raid entries are also credited by the runtime. Include all located raid
// creatures conservatively, so this check does not falsely call them blocked.
for(const [id,locations] of Object.entries(creatureLocations))if(locations.some(n=>['molten-core','onyxias-lair'].includes(n)))encounterEntries.add(+id);
const killable=new Set([...huntable,...encounterEntries]);
for(const id of [...killable])for(const key of ['KillCredit1','KillCredit2'])if(creatures[id]?.[key])killable.add(creatures[id][key]);
for(const node of Object.values(nodes)){
 if(!Number.isFinite(node.x)||!Number.isFinite(node.y))add('invalidCoordinates',{id:node.id});
 try{if(!Number.isFinite(route('northshire',node.id).duration))add('unreachableNode',{id:node.id});}catch(e){add('unreachableNode',{id:node.id,error:e.message});}
}
for(const edge of edges)if(!nodes[edge.a]||!nodes[edge.b])add('invalidRoad',edge);
for(const id of flightNodes)if(!nodes[id]||!flights.some(f=>f.a===id||f.b===id))add('isolatedFlight',{id});
for(const [id,locations] of Object.entries(creatureLocations))if(locations.some(n=>!nodes[n]))add('unmappedCreature',{id:+id,locations});
for(const [id,locations] of Object.entries(objectLocations))if(locations.some(n=>!nodes[n]))add('unmappedObject',{id:+id,locations});

const conditions=new Map(table('conditions').map(c=>[c.condition_entry,c]));
const supported=supportedConditionTypes;
function unsupportedConditions(id,seen=new Set()){
 if(!id||seen.has(id))return [];seen.add(id);
 const c=conditions.get(id);if(!c)return [{id,missing:true}];
 if(!supported.has(c.type))return [{id,type:c.type,value1:c.value1,value2:c.value2}];
 return c.type<0?[...unsupportedConditions(c.value1,seen),...(c.type!==-3?unsupportedConditions(c.value2,seen):[])]:[];
}
const state=createGame('内容审计',123,0);state.level=60;
const alternativeItems=new Set([...marketIds,...recipes.map(r=>r.item)]);
for(const q of Object.values(quests)){
 const label=questLabel(q),links=questLinks[q.entry]||{starts:[],ends:[]};
 const start=links.starts||[],end=links.ends||[];
 if(!start.some(e=>e.type==='item'?items[e.id]:validLocations(endpointNodes(e)).length))add('noLocatedStart',label);
 if(!end.some(e=>validLocations(endpointNodes(e)).length))add('noLocatedEnd',label);
 for(const kind of ['starts','ends'])for(const e of links[kind]||[]){
  const exists=(e.type==='item'?items:e.type==='creature'?creatures:objectTemplates)[e.id];
  if(!exists)add('missingEndpointTemplate',{...label,kind,endpoint:e});
 }
 for(const key of ['PrevQuestId','NextQuestId'])if(q[key]&&!quests[Math.abs(q[key])])add('missingQuestDependency',{...label,key,target:q[key]});
 const unsupported=unsupportedConditions(q.RequiredCondition);if(unsupported.length)add('unsupportedQuestCondition',{...label,conditions:unsupported});
 for(const prefix of ['ReqItemId','RewItemId','RewChoiceItemId'])for(let i=1;i<=(prefix==='RewChoiceItemId'?6:4);i++)if(q[prefix+i]&&!items[q[prefix+i]])add('missingQuestItem',{...label,key:prefix+i,item:q[prefix+i]});
 if(q.SrcItemId&&!items[q.SrcItemId])add('missingQuestItem',{...label,key:'SrcItemId',item:q.SrcItemId});
 state.quests={[q.entry]:{kills:{},event:false}};
 const scenes=questScenes(state,q.entry);
 for(const scene of scenes)if(!validLocations(scene.locations).length)add('unlocatedScene',{...label,key:scene.key,locations:scene.locations});
 for(let i=1;i<=4;i++){
  const target=q['ReqCreatureOrGOId'+i],spell=q['ReqSpellCast'+i],item=q['ReqItemId'+i];
  if(target>0&&!spell&&!killable.has(target)&&!scenes.some(s=>s.key==='encounter:'+i||s.key==='objective:'+i)&&q.entry!==434)add('locatedButUnkillableTarget',{...label,target,targetName:nameOf('npcs',target),locations:creatureLocations[target]||[]});
  if(spell&&!spells[spell])add('missingQuestSpell',{...label,spell});
  if(item&&!validLocations(itemSources(item)).length&&item!==q.SrcItemId&&!scenes.some(s=>s.key==='item:'+i))add(alternativeItems.has(item)?'itemSourceNavigationGap':'itemWithoutLocatedSource',{...label,item,itemName:nameOf('items',item),itemClass:items[item]?.class});
 }
}
for(const d of Object.values(dungeonDefinitions)){
 if(!nodes[d.entrance])add('missingDungeonEntrance',{id:d.id,entrance:d.entrance});
 const encounters=dungeonRoute(d.id);
 if(!encounters.length)add('emptyDungeon',{id:d.id});
 for(const e of encounters)for(const id of e.creatureTemplateIds)if(!creatures[id])add('missingDungeonCreature',{dungeon:d.id,encounter:e.id,id});
}
const summary={nodes:Object.keys(nodes).length,quests:Object.keys(quests).length,creatures:Object.keys(creatures).length,items:Object.keys(items).length,dungeons:Object.keys(dungeonDefinitions).length,huntableCreatures:huntable.size,issueCounts:Object.fromEntries(Object.entries(issues).map(([k,v])=>[k,{total:v.length,notExcluded:v.filter(r=>!r.excluded).length}]))};
const assetPaths=new Set();
for(const name of ['npc-models-manifest','classic-battle-models-manifest','dungeon-presentation','world-map-atlas']){
 const data=JSON.parse(readFileSync(new URL(`../packages/game-data/data/${name}.json`,import.meta.url),'utf8'));
 const walk=(value,key='')=>{
  if(typeof value==='string'&&((value.startsWith('/')&&!value.startsWith('//'))||key==='path')&&/\.(?:webp|jpg|png|glb|jpeg)$/.test(value))assetPaths.add(value.replace(/^\//,''));
  else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))walk(v,k);
 };walk(data);
}
for(const path of assetPaths)if(!existsSync(new URL('../apps/web/public/'+path,import.meta.url)))add('missingVisualAsset',{path});
summary.visualAssetPaths=assetPaths.size;
summary.issueCounts=Object.fromEntries(Object.entries(issues).map(([k,v])=>[k,{total:v.length,notExcluded:v.filter(r=>!r.excluded).length}]));
const directory=new URL('../artifacts/content-audit/',import.meta.url);await mkdir(directory,{recursive:true});
await writeFile(new URL('world-content.json',directory),JSON.stringify({summary,issues},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(process.argv.includes('--check')&&Object.values(summary.issueCounts).some(c=>c.notExcluded>0))process.exitCode=1;
