import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import data from '../../game-data/data/classic-bis.json' with {type:'json'};
import healers from '../../game-data/data/classic-bis-healers.json' with {type:'json'};
import {itemBis} from '../src/rules/item-bis.js';
import {itemView} from '../src/rules/client-content.js';
import {items} from '../src/rules/catalog.js';
test('BIS memberships retain phase provenance, verified icons and all nine classes',()=>{
 const classes=new Set();
 for(const source of [data,healers]){
  for(const spec of Object.values(source.specs)){classes.add(spec.classId);assert.ok(existsSync(new URL('../../../apps/web/public'+spec.icon,import.meta.url)),spec.icon);}
  for(const row of source.entries){assert.ok(source.specs[row.spec as keyof typeof source.specs]);assert.ok(Number.isInteger(row.phase)&&row.phase>=0&&row.phase<=6);assert.match(source.sources[row.source].url,/^https:\/\//);}
 }
 assert.equal(classes.size,9);
});
test('tooltip membership is explicit, deduplicated and does not infer phases or random suffixes',()=>{
 for(const item of Object.values(items) as any[]){
  const entries=itemBis(item.entry);
  for(const e of entries)assert.equal(new Set(e.phases.map(p=>p.phase)).size,e.phases.length);
  if(item.RandomProperty||item.RandomSuffix)assert.equal(entries.length,0);
 }
 const mage=itemBis(17103).find(e=>e.spec==='mage-frost');assert.deepEqual(mage?.phases.map(p=>p.phase),[1]);
 assert.equal(itemBis(17204).length,0);
 assert.deepEqual(itemView(18814)!.bis,itemBis(18814));
});
