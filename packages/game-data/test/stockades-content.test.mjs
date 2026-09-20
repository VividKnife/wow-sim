import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
test('Stockades source route and quest chain are complete',()=>{
 const d=read('stockades-reference');
 const ids=new Set(d.tables.quest_template.map(q=>q.entry));
 for(const id of [303,377,378,386,387,388,373,389,391,392,393,350,2745,2746,434,394,395,396]) assert.ok(ids.has(id),`quest ${id}`);
 const bosses=d.encounters.filter(e=>e.kind==='boss');
 assert.equal(bosses.length,6);
 assert.deepEqual(bosses.flatMap(e=>e.creatureTemplateIds).sort((a,b)=>a-b),[1663,1666,1696,1716,1717,1720]);
 const guids=d.encounters.flatMap(e=>e.sourceGuids);assert.equal(guids.length,new Set(guids).size);
 assert.equal(d.entrance.minimumLevel,15);
 for(const q of d.tables.quest_template) {assert.ok(d.questLinks[q.entry]);assert.equal(d.questXpByPlayerLevel[q.entry].length,60);}
 const creatures=new Set(d.tables.creature_template.map(c=>c.Entry));
 const items=new Set(d.tables.item_template.map(i=>i.entry));
 for(const q of d.tables.quest_template) {
  for(let n=1;n<=4;n++) {if(q[`ReqCreatureOrGOId${n}`]>0) assert.ok(creatures.has(q[`ReqCreatureOrGOId${n}`]),`quest ${q.entry} creature ${n}`);if(q[`ReqItemId${n}`]) assert.ok(items.has(q[`ReqItemId${n}`]));}
  for(const endpoint of [...d.questLinks[q.entry].starts,...d.questLinks[q.entry].ends]) if(endpoint.type==='creature') assert.ok(creatures.has(endpoint.id));
 }
 assert.ok(items.has(2933),'Seal of Wrynn');
 assert.ok(d.tables.gameobject_template.some(g=>g.entry===142076),"Clara's apples");
 assert.equal(bosses.find(e=>e.creatureTemplateIds.includes(1720)).rareChancePercent,20);
 const spells=new Set(d.tables.spell_template.map(s=>s.Id));
 for(const id of [29544,3391,7376,21156])assert.ok(spells.has(id),`triggered or stance spell ${id}`);
 for(const ai of d.tables.creature_ai_scripts) for(let n=1;n<=3;n++) if(ai[`action${n}_type`]===11) assert.ok(spells.has(ai[`action${n}_param1`]));
});
test('journal covers all Classic dungeon wings with self contained loot',()=>{
 const j=read('dungeon-journal');assert.ok(j.dungeons.length>=24);
 for(const id of ['deadmines','stockades','ragefire-chasm','wailing-caverns','scholomance','blackrock-depths','dire-maul-north','stratholme-undead']) assert.ok(j.dungeons.find(d=>d.id===id),id);
 assert.equal(j.dungeons.filter(d=>d.playable).length,2);
 for(const id of [4275,5711,9018,9040,9041,9217,10430,10899,11467,16080]) assert.ok(j.dungeons.some(d=>d.bosses.some(b=>b.id===id)),`boss ${id}`);
 const tribute=j.dungeons.find(d=>d.id==='dire-maul-north').bosses.find(b=>b.id===11501);
 assert.ok(tribute.loot.some(i=>i.source.table==='gameobject_loot_template'));
 for(const d of j.dungeons){assert.ok(d.bosses.length>0,d.id);assert.equal(new Set(d.bosses.map(b=>b.id)).size,d.bosses.length);for(const b of d.bosses) for(const i of b.loot){assert.ok(i.id&&i.name&&i.source);assert.ok(i.chance===null||i.chance>=0&&i.chance<=100);assert.ok('stats'in i&&'damage'in i&&'icon'in i);
  for(const path of i.source.paths){assert.equal(path.at(-1).item,i.id);for(let n=0;n<path.length-1;n++){assert.equal(-path[n].mincountOrRef,path[n+1].entry);if(path[n].group)assert.equal(path[n+1].group,path[n].group);}}
 }}
});
