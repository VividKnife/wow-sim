import source from '../../data/classic-reference.json' with { type: 'json' };
import helpers from '../../data/gameplay-reference.json' with { type: 'json' };
import icons from '../../data/icon-map.json' with { type: 'json' };
import talentSource from '../../data/mage-talents-2019.json' with { type: 'json' };
import clientRules from '../../data/client-rules-reference.json' with { type: 'json' };
import localization from '../../data/localization.json' with { type: 'json' };

const cache = new Map();
export function table(name) {
  if (!cache.has(name)) cache.set(name, (source.tables[name] || []).map(row => Object.fromEntries(source.schemas[name].map((key,i)=>[key,row[i]]))));
  return cache.get(name);
}
const index=(name,key)=>Object.fromEntries(table(name).map(row=>[row[key],row]));
export const creatures=index('creature_template','Entry');
export const items=index('item_template','entry');
export const spells=index('spell_template','Id');
for (const spell of clientRules.mageTalentSpells) spells[spell.Id]??=spell;
for (const item of clientRules.humanMageStartingItems) items[item.itemId]??=item.source;
export const startingItems=clientRules.humanMageStartingItems;
export const lookup=Object.fromEntries(Object.entries(clientRules.lookupTables).map(([k,rows])=>[k,Object.fromEntries(rows.map(r=>[r.id,r]))]));
export const localize=(kind,id)=>localization[kind]?.[id];
export function nameOf(kind,id){return localize(kind,id)?.nameZhCN||(kind==='items'?items[id]?.name:kind==='spells'?spells[id]?.SpellName:kind==='quests'?quests[id]?.Title:creatures[id]?.Name)||String(id);}
export const quests=index('quest_template','entry');
export const questLinks=source.links.quests;
export const xpTable=index('player_xp_for_level','lvl');
export const questXp=helpers.questXpByPlayerLevel;
export const talentTrees=talentSource.trees;
export const talents=Object.fromEntries(talentTrees.flatMap(tree=>tree.talents.map(t=>[t.id,{...t,tree:tree.id}])));
export const icon=(kind,id)=>icons[kind]?.[id]?'/icons/'+icons[kind][id]:null;
export const provenance={database:source.meta,core:helpers.core,talents:talentSource.source};
export const spellChain=index('spell_chain','spell_id');
export const abilities=helpers.mageAbilitiesThrough20;
export const groupBy=(rows,key)=>Object.groupBy(rows,r=>r[key]);
export const creatureLoot=groupBy(table('creature_loot_template'),'entry');
export const referenceLoot=groupBy(table('reference_loot_template'),'entry');
export const objectLoot=groupBy(table('gameobject_loot_template'),'entry');
export const objectTemplates=index('gameobject_template','entry');
export const questItemIds=new Set(Object.values(quests).flatMap(q=>[1,2,3,4].map(i=>q['ReqItemId'+i]).filter(Boolean)));

// Positions are reference world coordinates. The connecting road graph is a 2D
// adaptation, not a claim of measured client movement splines.
const nodeRows=[
 ['northshire','北郡修道院','北郡',-8910,-133,1,5,'town'],
 ['northwood','北郡林地','北郡',-8790,-190,1,3,'wild'],
 ['echo','回音山矿洞','北郡',-8650,-130,2,5,'wild'],
 ['vineyard','北郡葡萄园','北郡',-9070,-350,3,5,'wild'],
 ['goldshire','闪金镇','艾尔文',-9465,65,5,10,'town'],
 ['fargodeep','法戈第矿洞','艾尔文',-9790,100,5,8,'wild'],
 ['stonefield','石田农场','艾尔文',-9920,390,5,8,'town'],
 ['maclure','马科伦农场','艾尔文',-9900,-260,5,8,'town'],
 ['mirror','明镜湖','艾尔文',-9380,650,5,10,'wild'],
 ['crystal','水晶湖','艾尔文',-9510,-250,6,9,'wild'],
 ['jasper','玉石矿洞','艾尔文',-9190,-600,7,10,'wild'],
 ['tower','东谷桥','艾尔文',-9560,-1110,8,10,'town'],
 ['logging','东谷伐木场','艾尔文',-9470,-1280,8,10,'town'],
 ['brackwell','布莱克威尔南瓜田','艾尔文',-9870,-930,9,10,'wild'],
 ['westbrook','西泉要塞','艾尔文',-9660,680,8,11,'town'],
 ['forestedge','林边空地','艾尔文',-9980,620,9,11,'wild'],
 ['stormwind','暴风城贸易区','暴风城',-8833,628,1,20,'city'],
 ['magetower','法师区','暴风城',-9015,869,1,20,'city'],
 ['oldtown','旧城区与矮人区','暴风城',-8460,600,1,20,'city'],
 ['furlbrow','法布隆南瓜农场','西部荒野',-9900,1230,9,12,'town'],
 ['saldean','萨丁农场','西部荒野',-10130,1190,10,13,'town'],
 ['jansen','詹戈洛德矿洞','西部荒野',-10120,1440,11,14,'wild'],
 ['sentinel','哨兵岭','西部荒野',-10500,1040,10,20,'town'],
 ['alexton','阿历克斯顿农场','西部荒野',-10500,1670,12,15,'wild'],
 ['moonbrook','月溪镇','西部荒野',-11000,1500,14,18,'wild'],
 ['daggerhills','匕首岭','西部荒野',-11100,900,15,18,'wild'],
 ['coastnorth','长滩北岸','西部荒野',-9900,1850,11,15,'wild'],
 ['coast','长滩','西部荒野',-10700,2050,15,20,'wild'],
 ['lighthouse','西部荒野灯塔','西部荒野',-11400,1950,16,20,'town'],
 ['deadmines','死亡矿井入口','西部荒野',-11208,1676,17,22,'dungeon'],
 ['lakeshire','湖畔镇信使驿站','信使路线',-9270,-2190,15,20,'outpost'],
 ['ironforge','铁炉堡信使驿站','信使路线',-4845,-1140,15,20,'outpost'],
 ['thelsamar','塞尔萨玛信使驿站','信使路线',-5400,-2900,15,20,'outpost'],
];
export const nodes=Object.fromEntries(nodeRows.map(([id,name,region,x,y,min,max,kind])=>[id,{id,name,region,x,y,min,max,kind}]));
const roads=[['northshire','northwood'],['northwood','echo'],['northshire','vineyard'],['northshire','goldshire'],['goldshire','fargodeep'],['fargodeep','stonefield'],['fargodeep','maclure'],['goldshire','crystal'],['goldshire','mirror'],['goldshire','stormwind'],['goldshire','westbrook'],['westbrook','forestedge'],['crystal','jasper'],['crystal','tower'],['tower','logging'],['tower','brackwell'],['maclure','brackwell'],['stonefield','forestedge'],['westbrook','furlbrow'],['stormwind','magetower'],['stormwind','oldtown'],['furlbrow','saldean'],['furlbrow','coastnorth'],['saldean','jansen'],['saldean','sentinel'],['jansen','alexton'],['alexton','coast'],['alexton','moonbrook'],['sentinel','moonbrook'],['sentinel','daggerhills'],['coastnorth','coast'],['coast','lighthouse'],['moonbrook','deadmines'],['deadmines','lighthouse'],['tower','lakeshire'],['ironforge','thelsamar']];
export const edges=roads.map(([a,b])=>({a,b,distance:Math.ceil(Math.hypot(nodes[a].x-nodes[b].x,nodes[a].y-nodes[b].y)),status:'estimated road graph'}));
edges.push({a:'oldtown',b:'ironforge',distance:0,duration:180000,transport:'tram',status:'estimated tram journey'});
export function nearestNode(x,y,map=0){if(map===36)return 'deadmines';return nodeRows.reduce((best,n)=>Math.hypot(x-n[3],y-n[4])<Math.hypot(x-nodes[best].x,y-nodes[best].y)?n[0]:best,'northshire');}
export const spawns=table('creature');
export const creatureLocations={};
for(const spawn of spawns){const id=spawn.id;const node=nearestNode(spawn.position_x,spawn.position_y,spawn.map);(creatureLocations[id]??=[]);if(!creatureLocations[id].includes(node))creatureLocations[id].push(node);}
// Quest destinations beyond the selected-region spawn rectangles.
Object.assign(creatureLocations,{266:['lakeshire'],656:['ironforge'],514:['ironforge'],538:['thelsamar'],6122:['magetower'],5413:['oldtown'],12336:['oldtown']});
export const objectLocations={};
for(const spawn of table('gameobject')){const node=nearestNode(spawn.position_x,spawn.position_y,spawn.map);(objectLocations[spawn.id]??=[]);if(!objectLocations[spawn.id].includes(node))objectLocations[spawn.id].push(node);}
export function endpointNodes(endpoint){if(endpoint.type==='item')return [];return(endpoint.type==='creature'?creatureLocations:objectLocations)[endpoint.id]||[];}
export const monsterIdsAt=node=>Object.keys(creatureLocations).map(Number).filter(id=>creatureLocations[id].includes(node)&&creatures[id]?.MinLevel<=25&&creatures[id]?.NpcFlags===0&&![8,10,12].includes(creatures[id]?.CreatureType)&&!creatures[id]?.Civilian&&!creatures[id]?.Name.includes('Trigger')&&![1,35,12,11,55,80,84,1078].includes(creatures[id]?.Faction));
export const trainerNodes=['northshire','goldshire','magetower'];
export const flightNodes=['stormwind','sentinel'];
export const flights=[{a:'stormwind',b:'sentinel',duration:78000,cost:110,status:'estimated flight time; reference base cost'}];
export function route(from,to,speed=7){
 if(!nodes[from]||!nodes[to])throw new Error('未知目的地');
 const distance={[from]:0},paths={[from]:[]},remaining=new Set(Object.keys(nodes));
 while(remaining.size){const current=[...remaining].sort((a,b)=>(distance[a]??Infinity)-(distance[b]??Infinity))[0];if(distance[current]===undefined)break;remaining.delete(current);if(current===to)return{duration:Math.ceil(distance[to]),path:paths[to],distance:paths[to].reduce((n,e)=>n+e.distance,0)};
  for(const e of edges.filter(e=>e.a===current||e.b===current)){const next=e.a===current?e.b:e.a;const value=distance[current]+(e.duration??e.distance/speed*1000);if(value<(distance[next]??Infinity)){distance[next]=value;paths[next]=[...paths[current],e];}}}
 throw new Error('目前没有连通的路线');
}
