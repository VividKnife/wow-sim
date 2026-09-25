import moltenCoreLoot from '../../../game-data/data/molten-core-loot.json' with {type:'json'};
import stockades from '../../../game-data/data/stockades-reference.json' with {type:'json'};
import {companionKitItems} from './companion-kit.js';
import classDemons from '../../../game-data/data/class-demons-reference.json' with {type:'json'};
import source from '../../../game-data/data/classic-reference.json' with { type: 'json' };
import helpers from '../../../game-data/data/gameplay-reference.json' with { type: 'json' };
import icons from '../../../game-data/data/icon-map.json' with { type: 'json' };
import classIcons from '../../../game-data/data/class-icon-map.json' with { type: 'json' };
import spellIcons from '../../../game-data/data/spell-icon-map.json' with {type:'json'};
import talentSource from '../../../game-data/data/mage-talents-2019.json' with { type: 'json' };
import clientRules from '../../../game-data/data/client-rules-reference.json' with { type: 'json' };
import localization from '../../../game-data/data/localization.json' with { type: 'json' };
import stockadesAssets from '../../../game-data/data/stockades-item-assets.json' with {type:'json'};
import journeyAssets from '../../../game-data/data/journey-item-assets.json' with { type: 'json' };
import worldItemAssets from '../../../game-data/data/world-item-assets.json' with {type:'json'};
import supplement from '../../../game-data/data/quest-supplement-reference.json' with { type: 'json' };
import deadmines from '../../../game-data/data/deadmines-reference.json' with { type: 'json' };
import classReference from '../../../game-data/data/classes-reference.json' with { type: 'json' };
import talentDescriptionsZhCN from '../../../game-data/data/talent-descriptions-zhCN.json' with {type:'json'};
import {supplementalItems,professionNames} from './profession-data.js';
import professionTemplates from '../../../game-data/data/professions-templates.json' with {type:'json'};
import {utilityItemNames} from './utility-data.js';
import {classTravelNodes} from './class-utility-data.js';
import {additionalCityNodes,cityRoads} from './city-data.js';
import world from '../../../game-data/data/world-reference.json' with {type:'json'};
import dungeonSpellAssets from '../../../game-data/data/dungeon-spell-assets.json' with {type:'json'};
import dungeonScripts from '../../../game-data/data/dungeon-script-reference.json' with {type:'json'};
import worldLocalization from '../../../game-data/data/world-localization.json' with {type:'json'};
import questSupplement from '../../../game-data/data/quest-localization-supplement.json' with {type:'json'};
import questTooltip from '../../../game-data/data/quest-tooltip-localization.json' with {type:'json'};
import itemSupplement from '../../../game-data/data/item-localization-supplement.json' with {type:'json'};
import itemFlavor from '../../../game-data/data/item-flavor-localization.json' with {type:'json'};
import {worldNodes,worldRoads,worldTransports,worldDungeons,worldFlightNodes,capitals} from '../../../game-data/world-content.js';
import {questCreaturePlacements,questObjectPlacements} from '../../../game-data/world-quest-content.js';

const cache = new Map();
const tableKeys={
 quest_template:['entry'],conditions:['condition_entry'],creature:['guid','id'],gameobject:['guid','id'],item_template:['entry'],spell_template:['Id'],gameobject_template:['entry'],creature_template:['Entry'],creature_ai_scripts:['id'],
 creature_template_classlevelstats:['Level','Class'],npc_vendor:['entry','item'],npc_vendor_template:['entry','item'],
 playercreateinfo:['race','class'],player_levelstats:['race','class','level'],player_classlevelstats:['class','level'],
 playercreateinfo_action:['race','class','button'],playercreateinfo_spell:['race','class','Spell'],playercreateinfo_item:['race','class','itemid'],
 playercreateinfo_skills:['raceMask','classMask','skill','step'],spell_chain:['spell_id'],
 player_xp_for_level:['lvl'],spell_affect:['entry','effectId'],spell_proc_event:['entry'],spell_learn_spell:['entry','SpellID'],
 spell_pet_auras:['spell','pet'],petcreateinfo_spell:['entry'],pet_levelstats:['creature_entry','level'],pet_familystats:['family'],creature_template_spells:['entry','setId'],
};
export function table(name) {
  if (!cache.has(name)) {
    const decode=(bundle,row)=>Object.fromEntries(bundle.schemas[name].map((key,i)=>[key,row[i]]));
    const rows=(source.tables[name] || []).map(row=>decode(source,row));
    // Merge source bundles by their actual table keys; keep authored overrides.
    const keys={creature:'guid',gameobject:'guid',item_template:'entry',spell_template:'Id',gameobject_template:'entry',creature_template:'Entry',creature_ai_scripts:'id'};
    const extra=name==='creature'?[...supplement.tables.creature,...supplement.tables.missingCreatureGuidSpawns,...supplement.tables.groupCreatureGuidSpawns]:keys[name]||name==='gameobject_loot_template'?supplement.tables[name]||[]:[];
    const key=r=>(tableKeys[name]||['entry','item','groupid']).map(field=>r[field]).join(':');
    const seen=new Set(rows.map(key));for(const row of extra)if(!seen.has(key(row))){rows.push(row);seen.add(key(row));}
    for(const row of [...(deadmines.tables[name]||[]),...(stockades.tables[name]||[])])if(!seen.has(key(row))){rows.push(row);seen.add(key(row));}
    for(const packed of classReference.tables[name]||[]){const row=decode(classReference,packed);if(!seen.has(key(row))){rows.push(row);seen.add(key(row));}else if(['spell_affect','spell_proc_event'].includes(name)){Object.assign(rows.find(existing=>key(existing)===key(row)),row);}}
    for(const packed of professionTemplates.tables[name]||[]){const row=decode(professionTemplates,packed);if(!seen.has(key(row))){rows.push(row);seen.add(key(row));}}
    for(const row of classDemons.tables[name]||[])if(!seen.has(key(row))){rows.push(row);seen.add(key(row));}
    for(const row of dungeonScripts.tables[name]||[])if(!seen.has(key(row))){rows.push(row);seen.add(key(row));}
    for(const row of moltenCoreLoot.tables[name]||[])if(!seen.has(key(row))){rows.push(row);seen.add(key(row));}
    for(const packed of world.tableData[name]?JSON.parse(world.tableData[name]):[]){const row=decode(world,packed);if(!seen.has(key(row))){rows.push(row);seen.add(key(row));}}
    if(name==='npc_vendor')for(const c of table('creature_template'))if(c.VendorTemplateId)for(const r of table('npc_vendor_template').filter(r=>r.entry===c.VendorTemplateId)){const row={...r,entry:c.Entry};if(!seen.has(key(row))){rows.push(row);seen.add(key(row));}}
    cache.set(name,rows);
  }
  return cache.get(name);
}
const index=(name,key)=>Object.fromEntries(table(name).map(row=>[row[key],row]));
export const creatures=index('creature_template','Entry');
export const items=index('item_template','entry');
for(const item of companionKitItems()){const appearance=Object.values(items).find(i=>!i.companionKit&&i.InventoryType===item.InventoryType&&i.subclass===item.subclass&&i.Quality===2&&icons.items?.[i.entry]);items[item.entry]={...item,appearanceItemId:appearance?.entry};}
for(const item of moltenCoreLoot.tables.item_template)if(item.Quality>=4)items[item.entry].raidReward=true;
for(const item of supplementalItems)items[item.entry]??=item;
export const spells=index('spell_template','Id');
for (const spell of clientRules.mageTalentSpells) spells[spell.Id]??=spell;
for (const item of clientRules.humanMageStartingItems) items[item.itemId]??=item.source;
export const classDefinitions=classReference.classDefinitions;
export const raceDefinitions=classReference.raceDefinitions;
export const classAbilities=classReference.classAbilities;
export const classContentManifest=classReference.classContentManifest;
export const classEnchantments=classReference.classEnchantments;
export const preciseSpellFamilyFlags=classReference.preciseSpellFamilyFlags;
export const classQuestSources=classReference.classQuestSources;
export const classItemInventory=classReference.classItemInventory;
export const classLocks=classReference.classLocks;
export const classStartingItems=classReference.classStartingItems;
export const startingItems=classStartingItems['1:8'];
export const lookup=Object.fromEntries(Object.entries(clientRules.lookupTables).map(([k,rows])=>[k,Object.fromEntries(rows.map(r=>[r.id,r]))]));
export const itemSets=moltenCoreLoot.sets;
export const raidItemAssets=moltenCoreLoot.assets;
const localizedCache=new Map();
export function localize(kind,id){
 const key=`${kind}:${id}`;
 if(localizedCache.has(key))return localizedCache.get(key);
 const sources=[kind==='quests'?questSupplement.quests[id]:kind==='items'?itemSupplement.items[id]:undefined,kind==='quests'?questTooltip.quests[id]:undefined,worldLocalization[kind]?.[id],kind==='items'?itemFlavor.items[id]:undefined,kind==='items'?journeyAssets.items[id]:undefined,localization[kind]?.[id],stockades.localization?.[kind]?.[id],kind==='items'?stockadesAssets.items[id]:undefined,kind==='items'?moltenCoreLoot.assets[id]:undefined];
 const merged=Object.assign({},...sources.filter(Boolean).map(source=>Object.fromEntries(Object.entries(source).filter(([field,value])=>value!==null&&value!==undefined&&value!==''&&(!field.endsWith('ZhCN')||typeof value!=='string'||/[\u3400-\u9fff]/.test(value))))));
 const result=Object.keys(merged).length?merged:undefined;
 localizedCache.set(key,result);
 return result;
}
const questNpcNames={4073:'伐木机 XT:4',4074:'伐木机 XT:9',9623:'机器人 A-Me 01',15221:'弗兰卡尔的踪迹',15222:'鲁特加的踪迹'};
export function nameOf(kind,id){
 const localized=(kind==='npcs'?questNpcNames[id]:undefined)||localize(kind,id)?.nameZhCN;
 if(localized)return localized;
 if(kind==='items'){
  const raw=professionNames[id]||utilityItemNames[id]||items[id]?.name;
  return /[\u3400-\u9fff]/.test(raw||'')?raw:`物品 ${id}`;
 }
 return(kind==='spells'?dungeonSpellAssets.spells[id]?.nameZhCN||classReference.translations?.spellNamesByEnglish?.[spells[id]?.SpellName]||talentsBySpell[id]?.nameZhCN||spells[id]?.SpellName:kind==='quests'?quests[id]?.Title:creatures[id]?.Name)||String(id);
}
export const quests=index('quest_template','entry');
export const questLinks={...world.questLinks,...source.links.quests,...stockades.questLinks};
export const xpTable=index('player_xp_for_level','lvl');
export const questXp={...helpers.questXpByPlayerLevel,...stockades.questXpByPlayerLevel,...world.questXpByPlayerLevel};
const talentNameCorrections={'4:Camouflage':'伪装','9:Devastation':'破坏'};
export const classTalentTrees=classReference.classTalentTrees.map(tree=>({...tree,talents:tree.talents.map(talent=>({...talent,nameZhCN:talentNameCorrections[`${tree.classId}:${talent.name}`]||talent.nameZhCN}))}));
export const talentTrees=classTalentTrees.filter(tree=>tree.classId===8);
export const talents=Object.fromEntries(classTalentTrees.flatMap(tree=>tree.talents.map(t=>[t.id,{...t,tree:tree.id,classId:tree.classId,rankEffects:t.rankEffects.map(effect=>({...effect,descriptionZhCN:talentDescriptionsZhCN.descriptions[effect.spellId]}))}])));
const talentsBySpell=Object.fromEntries(Object.values(talents).flatMap(t=>t.ranks.map(id=>[id,t])));
export const icon=(kind,id)=>kind==='items'&&moltenCoreLoot.assets[id]?.icon?'/icons/assets/'+moltenCoreLoot.assets[id].icon+'.png':kind==='items'&&items[id]?.appearanceItemId?icon('items',items[id].appearanceItemId):icons[kind]?.[id]?'/icons/'+icons[kind][id]:classIcons[kind]?.[id]?'/icons/'+classIcons[kind][id]:kind==='items'&&stockadesAssets.items[id]?.icon?'/icons/'+stockadesAssets.items[id].icon:kind==='items'&&journeyAssets.items[id]?.icon?'/icons/'+journeyAssets.items[id].icon:kind==='items'&&worldItemAssets.items[id]?.icon?'/icons/'+worldItemAssets.items[id].icon:kind==='spells'&&dungeonSpellAssets.spells[id]?.icon?'/icons/'+dungeonSpellAssets.spells[id].icon:kind==='spells'?((talentsBySpell[id]?icon('talents',talentsBySpell[id].id):null)||(spellIcons.icons[spells[id]?.SpellIconID]?'/icons/'+spellIcons.icons[spells[id].SpellIconID]:null)):null;
export const provenance={database:source.meta,core:helpers.core,talents:talentSource.source,classes:classReference.meta};
export const spellChain=index('spell_chain','spell_id');
export const abilities=classAbilities[8];
export const groupBy=(rows,key)=>Object.groupBy(rows,r=>r[key]);
export const creatureLoot=groupBy(table('creature_loot_template'),'entry');
export const referenceLoot=groupBy(table('reference_loot_template'),'entry');
export const objectLoot=groupBy(table('gameobject_loot_template'),'entry');
export const objectTemplates=index('gameobject_template','entry');
for(const [id,object]of Object.entries(objectTemplates))if(worldLocalization.objects[id]?.nameZhCN)objectTemplates[id]={...object,name:worldLocalization.objects[id].nameZhCN};
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
 ['bluerecluse','蓝色隐士','暴风城',-9080,835,15,20,'city'],
 ['oldtown','旧城区','暴风城',-8660,390,1,60,'city'],
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
 ['stockades','暴风城监狱入口','暴风城',-8766,845,22,30,'dungeon'],
 ['darkshire','夜色镇','暮色森林',-10560,-1180,20,30,'town'],
 ['dunmodr','丹莫德','湿地',-2600,-2450,27,32,'outpost'],
 ['menethil','米奈希尔港','湿地',-3740,-755,20,30,'town'],
 ['deadmines','死亡矿井入口','西部荒野',-11208,1676,17,22,'dungeon'],
 ['lakeshire','湖畔镇信使驿站','信使路线',-9270,-2190,15,20,'outpost'],
 ['ironforge','铁炉堡信使驿站','信使路线',-4845,-1140,15,20,'outpost'],
 ['thelsamar','塞尔萨玛信使驿站','信使路线',-5400,-2900,15,20,'outpost'],
 ['algaz','奥加兹岗哨','信使路线',-4826,-2677,15,20,'outpost'],
 ['silverstream','银泉矿洞','信使路线',-4900,-2980,15,20,'wild'],
];
export const nodes=Object.fromEntries(nodeRows.map(([id,name,region,x,y,min,max,kind])=>[id,{id,name,region,x,y,min,max,kind}]));
for(const [id,name,region,x,y,min,max,kind] of additionalCityNodes)nodes[id]={id,name,region,x,y,min,max,kind};
for(const n of Object.values(nodes))if(n.region==='暴风城'){n.min=1;n.max=60;}
for(const [id,node] of Object.entries(classTravelNodes))nodes[id]??={...node,region:'主城传送',x:null,y:null,min:node.level?.[0]??1,max:node.level?.[1]??60,transportOnly:true};
for(const node of Object.values(nodes)){node.map=0;node.faction='Alliance';}
for(const node of worldNodes)nodes[node.id]={...node};
for(const d of worldDungeons){const parent=nodes[d.parent];nodes[d.id]={id:d.id,name:(world.dungeons[d.id]?.name||d.name)+'入口',region:parent.region,map:parent.map,x:parent.x+60,y:parent.y+60,min:d.min,max:d.max,kind:'dungeon',mountAllowed:false};}
// Coarse map restrictions: mine/interior approaches are walked in this 2D map.
for(const id of ['echo','fargodeep','jasper','jansen','silverstream','deadmines','stockades','bluerecluse','magetower'])nodes[id].mountAllowed=false;
const roads=[['magetower','stockades'],['cathedral','stockades'],['tower','darkshire'],['algaz','menethil'],['menethil','dunmodr'],['northshire','northwood'],['northwood','echo'],['northshire','vineyard'],['northshire','goldshire'],['goldshire','fargodeep'],['fargodeep','stonefield'],['fargodeep','maclure'],['goldshire','crystal'],['goldshire','mirror'],['goldshire','stormwind'],['goldshire','westbrook'],['westbrook','forestedge'],['crystal','jasper'],['crystal','tower'],['tower','logging'],['tower','brackwell'],['maclure','brackwell'],['stonefield','forestedge'],['westbrook','furlbrow'],['stormwind','magetower'],['stormwind','oldtown'],['furlbrow','saldean'],['furlbrow','coastnorth'],['saldean','jansen'],['saldean','sentinel'],['jansen','alexton'],['alexton','coast'],['alexton','moonbrook'],['sentinel','moonbrook'],['sentinel','daggerhills'],['coastnorth','coast'],['coast','lighthouse'],['moonbrook','deadmines'],['deadmines','lighthouse'],['tower','lakeshire'],['ironforge','thelsamar']];
export const edges=roads.map(([a,b])=>({a,b,distance:Math.ceil(Math.hypot(nodes[a].x-nodes[b].x,nodes[a].y-nodes[b].y)),status:'estimated road graph'}));
for(const [a,b] of cityRoads)edges.push({a,b,distance:Math.ceil(Math.hypot(nodes[a].x-nodes[b].x,nodes[a].y-nodes[b].y)),status:'adapted city road'});
for(const[a,b]of [['thelsamar','algaz'],['algaz','silverstream'],['magetower','bluerecluse']])edges.push({a,b,distance:Math.ceil(Math.hypot(nodes[a].x-nodes[b].x,nodes[a].y-nodes[b].y)),status:'estimated road graph'});
for(const[a,b]of [...worldRoads,...worldDungeons.map(d=>[d.parent,d.id])])if(!edges.some(e=>e.a===a&&e.b===b||e.a===b&&e.b===a))edges.push({a,b,distance:Math.ceil(Math.hypot(nodes[a].x-nodes[b].x,nodes[a].y-nodes[b].y)),status:'adapted world road'});
for(const[a,b,transport,duration]of worldTransports)edges.push({a,b,distance:0,duration,transport,status:'adapted scheduled transport'});
export const travelSpeedMultiplier=1.3;
export const baseTravelSpeed=7*travelSpeedMultiplier;
const fasterTravelDuration=duration=>Math.ceil(duration/travelSpeedMultiplier);
edges.push({a:'dwarven',b:'ironforge',distance:0,duration:fasterTravelDuration(180000),transport:'tram',status:'estimated tram journey'});
const positionedNodes=Object.values(nodes).filter(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&n.kind!=='dungeon');
export function nearestNode(x,y,map=0){
 if(map===36)return 'deadmines';if(map===34)return 'stockades';
 if(map===249)return 'onyxias-lair';if(map===409)return 'molten-core';
 const instances=worldDungeons.filter(d=>d.map===map);
 if(instances.length){
  const positioned=instances.filter(d=>world.dungeons[d.id]?.reference?.entrance);
  if(!positioned.length)return instances[0].id;
  return positioned.reduce((best,d)=>{const p=world.dungeons[d.id].reference.entrance,b=world.dungeons[best.id].reference.entrance;return Math.hypot(x-p.position_x,y-p.position_y)<Math.hypot(x-b.position_x,y-b.position_y)?d:best;}).id;
 }
 const pool=positionedNodes.filter(n=>n.map===map);
 if(!pool.length)return null;
 return pool.reduce((best,n)=>Math.hypot(x-n.x,y-n.y)<Math.hypot(x-best.x,y-best.y)?n:best).id;
}
const alternateEntries=Object.groupBy([...supplement.tables.regionalCreatureSpawnEntry,...(stockades.tables.creature_spawn_entry||[])],r=>r.guid);
const creatureGroups=new Set(supplement.tables.spawn_group.filter(g=>g.Type===0).map(g=>g.Id));
const groupEntries=Object.groupBy(supplement.tables.spawn_group_entry,r=>r.Id);
const groupsByGuid=Object.groupBy(supplement.tables.spawn_group_spawn.filter(g=>creatureGroups.has(g.Id)),r=>r.Guid);
// Resolve available templates by GUID; zero is a spawn placeholder, not a mob.
// The 2D location catalogue lists alternatives. Spawn population and rare-spawn
// scheduling are separate encounter rules and remain to be implemented.
export const spawns=table('creature').flatMap(spawn=>spawn.id?[spawn]:[...new Set([...(alternateEntries[spawn.guid]||[]).map(r=>r.entry),...(groupsByGuid[spawn.guid]||[]).flatMap(g=>(groupEntries[g.Id]||[]).map(r=>r.Entry))])].map(id=>({...spawn,id})));
export const creatureLocations={};
for(const spawn of spawns){const id=spawn.id;const node=nearestNode(spawn.position_x,spawn.position_y,spawn.map);(creatureLocations[id]??=[]);if(!creatureLocations[id].includes(node))creatureLocations[id].push(node);}
// Quest destinations beyond the selected-region spawn rectangles.
Object.assign(creatureLocations,{266:['lakeshire'],656:['ironforge'],514:['ironforge'],538:['thelsamar'],6122:['magetower'],5413:['dwarven'],12336:['cathedral']});
for(const [id,places]of Object.entries(stockades.npcPlacements||{}))creatureLocations[id]=Array.isArray(places)?places:[places];
for(const [id,places]of Object.entries(world.creaturePlacements))creatureLocations[id]=[...new Set([...(creatureLocations[id]||[]),...places])];
for(const [id,places]of Object.entries(questCreaturePlacements))creatureLocations[id]=[...places];
export const objectLocations={};
export const objectSpawnsByNode={};
for(const spawn of table('gameobject')){const node=nearestNode(spawn.position_x,spawn.position_y,spawn.map);(objectSpawnsByNode[node+':'+spawn.id]??=[]).push(spawn);(objectLocations[spawn.id]??=[]);if(!objectLocations[spawn.id].includes(node))objectLocations[spawn.id].push(node);}
for(const [id,places]of Object.entries(questObjectPlacements))objectLocations[id]=[...places];
export function endpointNodes(endpoint){if(endpoint.type==='item')return [];return(endpoint.type==='creature'?creatureLocations:objectLocations)[endpoint.id]||[];}
export const outdoorCreatureLocations={};
for(const spawn of spawns.filter(s=>s.map===0||s.map===1)){const node=nearestNode(spawn.position_x,spawn.position_y,spawn.map);(outdoorCreatureLocations[spawn.id]??=[]);if(!outdoorCreatureLocations[spawn.id].includes(node))outdoorCreatureLocations[spawn.id].push(node);}
export const instanceSpawns=spawns.filter(s=>s.map===36);
export const attackableCreature=id=>{const c=creatures[id];return !!(c&&c.MinLevel>0&&c.MinLevel<=63&&c.ModelId1>0&&![11686,13069,15294].includes(c.ModelId1)&&!c.NpcFlags&&!(c.UnitFlags&0x10102)&&![8,12].includes(c.CreatureType)&&!c.Civilian&&!/Trigger|Doodad|Counter|Marker/i.test(c.Name)&&![1,35,12,11,55,80,84,1078].includes(c.Faction));};
const questKillTargets=new Set(Object.values(quests).flatMap(q=>[1,2,3,4].filter(n=>!q['ReqSpellCast'+n]).map(n=>q['ReqCreatureOrGOId'+n])).filter(id=>id>0));
const monstersByNode=new Map();
for(const [entry,locations]of Object.entries(outdoorCreatureLocations)){const id=Number(entry);if(id===6492||[1754,1755].includes(id)||!attackableCreature(id))continue;for(const node of locations)if(creatures[id].MinLevel<=Math.min(63,(nodes[node]?.max||60)+2)||questKillTargets.has(id)){if(!monstersByNode.has(node))monstersByNode.set(node,[]);monstersByNode.get(node).push(id);}}
export const monsterIdsAt=node=>[...(monstersByNode.get(node)||[])];
export const trainerNodes=['northshire','goldshire','magetower',...Object.keys(classTravelNodes),...worldNodes.filter(n=>n.kind==='town'||n.kind==='city').map(n=>n.id)];
export const flightNodes=['stormwind','sentinel',...worldFlightNodes];
export const flights=[{a:'stormwind',b:'sentinel',duration:fasterTravelDuration(78000),cost:110,status:'estimated flight time; reference base cost'}];
for(const capital of capitals)for(const id of flightNodes){const n=nodes[id];if(id===capital.id||n.map!==capital.map||n.faction!==capital.faction&&n.faction!=='Contested'||flights.some(f=>f.a===capital.id&&f.b===id))continue;flights.push({a:capital.id,b:id,duration:Math.max(30000,Math.ceil(Math.hypot(n.x-capital.x,n.y-capital.y)/32*1000)),cost:Math.max(10,n.min*10),faction:capital.faction,status:'adapted flight route'});}
const routeCache=new Map();
const adjacent=Object.groupBy(edges.flatMap(e=>[{node:e.a,edge:e},{node:e.b,edge:e}]),e=>e.node);
export function route(from,to,speed=baseTravelSpeed){
 if(!nodes[from]||!nodes[to])throw new Error('未知目的地');
 if(speed>baseTravelSpeed)return ridingRoute(from,to,speed);
 const key=from+':'+speed;
 if(routeCache.has(key)){const result=routeCache.get(key)[to];if(!result)throw new Error('目前没有连通的路线');return structuredClone(result);}
 const distance={[from]:0},paths={[from]:[]},remaining=new Set(Object.keys(nodes));
 while(remaining.size){const current=[...remaining].sort((a,b)=>(distance[a]??Infinity)-(distance[b]??Infinity))[0];if(distance[current]===undefined)break;remaining.delete(current);
  for(const {edge:e} of adjacent[current]||[]){const next=e.a===current?e.b:e.a;const value=distance[current]+(e.duration??e.distance/speed*1000);if(value<(distance[next]??Infinity)){distance[next]=value;paths[next]=[...paths[current],e];}}}
 const results=Object.fromEntries(Object.entries(paths).map(([id,path])=>[id,{duration:Math.ceil(distance[id]),path,distance:path.reduce((n,e)=>n+e.distance,0)}]));
 if(routeCache.size>=64)routeCache.delete(routeCache.keys().next().value);routeCache.set(key,results);
 if(!results[to])throw new Error('目前没有连通的路线');return structuredClone(results[to]);
}

// Dijkstra over (location, still riding). A forbidden segment dismounts the
// traveler for the remainder of the trip; we never grant an instant remount.
function ridingRoute(from,to,speed){
 const key=(node,riding)=>node+':'+Number(riding),initial={node:from,riding:nodes[from].mountAllowed!==false,cost:0,path:[]};
 const pending=[initial],best=new Map([[key(from,initial.riding),0]]);
 while(pending.length){
  pending.sort((a,b)=>a.cost-b.cost);const current=pending.shift();
  if(current.cost!==best.get(key(current.node,current.riding)))continue;
  if(current.node===to)return {duration:Math.ceil(current.cost),path:current.path,distance:current.path.reduce((sum,e)=>sum+e.distance,0)};
  for(const e of edges.filter(e=>e.a===current.node||e.b===current.node)){
   const next=e.a===current.node?e.b:e.a;
   const riding=current.riding&&e.duration===undefined&&e.mountAllowed!==false&&nodes[next].mountAllowed!==false;
   const duration=e.duration??e.distance/(riding?speed:baseTravelSpeed)*1000,cost=current.cost+duration,k=key(next,riding);
   if(cost<(best.get(k)??Infinity)){best.set(k,cost);pending.push({node:next,riding,cost,path:[...current.path,{...e,duration,riding}]});}
  }
 }
 throw new Error('目前没有连通的路线');
}
