import {creatures,creatureLocations,questLinks,endpointNodes,objectTemplates,nameOf,table,classDefinitions} from './catalog.js';
import {canTrainAt} from './city.js';
import {classSupplyShop} from './class-acquisition.js';
import portraits from '../../../game-data/data/npc-models-manifest.json' with {type:'json'};

const assets=new Map(portraits.assets.map(asset=>[asset.id,'/'+asset.path]));
const vendors=new Map();
for(const row of table('npc_vendor')){if(!vendors.has(row.entry))vendors.set(row.entry,[]);vendors.get(row.entry).push(row.item);}
const locals=new Map();
for(const [id,locations]of Object.entries(creatureLocations))for(const location of locations){if(!locals.has(location))locals.set(location,[]);locals.get(location).push(Number(id));}

export function localInteractions(s,quests){
 const result=new Map();
 const get=(type,id)=>{const key=type+':'+id;if(!result.has(key))result.set(key,{key,entry:type==='creature'?id:null,name:type==='creature'?nameOf('npcs',id):type==='item'?nameOf('items',id):objectTemplates[id]?.name||'任务物件',portrait:type==='creature'?assets.get(portraits.entries[id]?.assetId)||null:null,roles:[],accepts:[],turnIns:[],stockIds:[]});return result.get(key);};
 const role=(npc,kind)=>{if(!npc.roles.includes(kind))npc.roles.push(kind);};
 for(const q of quests)for(const [kind,eligible,field]of [['starts',q.canAccept,'accepts'],['ends',q.canTurnIn,'turnIns']]){
  if(!eligible)continue;
  for(const endpoint of questLinks[q.id]?.[kind]||[]){
   if(endpoint.type==='item'?!s.bag.some(item=>item.id===endpoint.id):!endpointNodes(endpoint).includes(s.location))continue;
   const npc=get(endpoint.type,endpoint.id);role(npc,'quests');npc[field].push(q.id);
  }
 }
 if(!s.dungeon)for(const id of locals.get(s.location)||[]){
  if(vendors.has(id)){const npc=get('creature',id);role(npc,'shop');npc.stockIds=vendors.get(id);}
  if([295,6740,8931].includes(id))role(get('creature',id),'inn');
  if(canTrainAt(s)&&creatures[id]?.TrainerClass===s.classId&&/Trainer/.test(creatures[id]?.SubName||''))role(get('creature',id),'trainer');
 }
 if(!s.dungeon&&canTrainAt(s)&&![...result.values()].some(n=>n.roles.includes('trainer'))){
  result.set('class-trainer',{key:'class-trainer',entry:null,name:(classDefinitions.find(c=>c.id===s.classId)?.name||'职业')+'训练师',portrait:null,roles:['trainer'],accepts:[],turnIns:[],stockIds:[]});
 }
 const supplies=classSupplyShop(s),trainer=[...result.values()].find(n=>n.roles.includes('trainer'));
 if(trainer&&supplies.length){role(trainer,'shop');trainer.stockIds=[...new Set([...trainer.stockIds,...supplies.map(i=>i.id)])];}
 return [...result.values()].sort((a,b)=>Number(b.roles.includes('quests'))-Number(a.roles.includes('quests'))||a.name.localeCompare(b.name));
}
