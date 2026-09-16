import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {creatures,nodes,monsterIdsAt} from '../apps/web/lib/game/catalog.js';
import deadmines from '../apps/web/data/deadmines-reference.json' with {type:'json'};

// Blizzard icon art served unchanged by Wowhead's CDN. These are deliberate
// family/type fallbacks, never purported renders of individual creature models.
const definitions=[
 ['unknown','inv_misc_questionmark','未知生物',0,null],
 ['beast','ability_tracking','野兽',1,'https://www.wowhead.com/classic/spell=1494/track-beasts'],
 ['humanoid','spell_holy_prayerofhealing','人型生物',7,'https://www.wowhead.com/classic/spell=19883/track-humanoids'],
 ['undead','spell_shadow_darksummoning','亡灵',6,'https://www.wowhead.com/classic/spell=19884/track-undead'],
 ['elemental','spell_frost_summonwaterelemental','元素生物',4,'https://www.wowhead.com/classic/spell=19880/track-elementals'],
 ['mechanical','ability_repair','机械',9,null],
 ['wolf','ability_hunter_pet_wolf','狼',null,'https://www.wowhead.com/classic/pet=1/wolf',1],
 ['spider','ability_hunter_pet_spider','蜘蛛',null,'https://www.wowhead.com/classic/pet=3/spider',3],
 ['bear','ability_hunter_pet_bear','熊',null,'https://www.wowhead.com/classic/pet=4/bear',4],
 ['boar','ability_hunter_pet_boar','野猪',null,'https://www.wowhead.com/classic/pet=5/boar',5],
 ['vulture','ability_hunter_pet_vulture','食腐鸟',null,'https://www.wowhead.com/classic/pet=7/carrion-bird',7],
 ['crab','ability_hunter_pet_crab','螃蟹',null,'https://www.wowhead.com/classic/pet=8/crab',8],
];
const manifest={schemaVersion:1,retrievedAt:new Date().toISOString().slice(0,10),
 provenance:'Original Blizzard icon art served by Wowhead CDN, downloaded unchanged. Third-party reference mirror; not a historical client build archive.',
 copyright:'Blizzard Entertainment game assets. Repository source-code licenses do not relicense these files.',
 limitation:'All assets are generic species or creature-type icons. No exact NPC portraits, model textures, animation sequences or historical-build byte equivalence are claimed.',
 mappingSource:'Entry, ModelId1..4, Family and CreatureType from the pinned local classic-reference, quest-supplement-reference and deadmines-reference data.',
 assets:[],entries:{},models:{},families:{},types:{}};
await mkdir(new URL('../apps/web/public/creatures/',import.meta.url),{recursive:true});
for(const [id,icon,label,type,sourcePage,family] of definitions){
 const url=`https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg`;
 if(sourcePage){
  const page=await fetch(sourcePage);
  if(!page.ok||!(await page.text()).includes(icon))throw new Error(`Icon not verified on ${sourcePage}: ${icon}`);
 }
 const response=await fetch(url);if(!response.ok)throw new Error(`${response.status} ${url}`);
 const data=Buffer.from(await response.arrayBuffer());
 if(data.readUInt16BE(0)!==0xffd8)throw new Error(`Not JPEG: ${url}`);
 const path=`creatures/${icon}.jpg`;
 await writeFile(new URL('../apps/web/public/'+path,import.meta.url),data);
 manifest.assets.push({id,icon,label:label+'原版类型图标',kind:family?'species-icon':'type-icon',path,url,sourcePage:sourcePage||url,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length,transformation:'none'});
 if(type!=null)manifest.types[type]=id;if(family)manifest.families[family]=id;
}
const ids=[...new Set([...Object.keys(nodes).flatMap(monsterIdsAt),...deadmines.encounters.flatMap(e=>e.sourceSpawns.flatMap(s=>s.templateChoices.map(t=>t.entry))),643])].sort((a,b)=>a-b);
const modelChoices=new Map();
for(const entry of ids){
 const c=creatures[entry],assetId=manifest.families[c.Family]||manifest.types[c.CreatureType]||'unknown';
 const models=[c.ModelId1,c.ModelId2,c.ModelId3,c.ModelId4].filter(Boolean);
 manifest.entries[entry]={assetId,models,family:c.Family,creatureType:c.CreatureType};
 for(const model of models){const choices=modelChoices.get(model)||new Set();choices.add(assetId);modelChoices.set(model,choices);}
}
// A reused model with conflicting classifications cannot establish a mapping.
for(const [model,choices] of modelChoices)if(choices.size===1)manifest.models[model]=[...choices][0];
await writeFile(new URL('../apps/web/data/creature-assets-manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(`Imported ${manifest.assets.length} original icons for ${ids.length} creature templates.`);
