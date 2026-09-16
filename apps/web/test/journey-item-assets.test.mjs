import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {icon,nameOf} from '../../../packages/game-domain/src/rules/catalog.js';

const root=new URL('../../../',import.meta.url);
const raw=path=>readFileSync(new URL(path,root));
const json=path=>JSON.parse(raw(path));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('normal journey items have traceable display identities and verified original PNGs',()=>{
 const base='docs/research/import/journey-item-assets/';
 const scope=json(base+'scope.json'),manifest=json(base+'manifest.json');
 const mapping=json('packages/game-data/data/journey-item-assets.json').items;
 assert.equal(sha(raw(base+'scope.json')),manifest.scopeSha256);
 assert.deepEqual(Object.keys(mapping).map(Number).sort((a,b)=>a-b),scope.itemIds);
 for(const record of manifest.items){
  const bytes=raw(record.file),tooltip=JSON.parse(bytes);
  assert.equal(sha(bytes),record.sha256);
  assert.equal(mapping[record.itemId].nameZhCN,tooltip.name);
  assert.equal(record.icon,tooltip.icon.toLowerCase());
  assert.ok(icon('items',record.itemId)||manifest.missing.some(m=>m.itemId===record.itemId));
 }
 for(const asset of manifest.assets){
  const bytes=raw(asset.file);
  assert.equal(sha(bytes),asset.sha256);
  assert.equal(createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'),asset.gitBlobSha1);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 }
});

test('Northshire supplies and common wolf loot show their actual item icons and Chinese names',()=>{
 for(const [id,name] of [[4540,'大块硬面包'],[2672,'多汁狼肉'],[4865,'破烂的毛皮'],[7073,'断牙'],[7074,'破碎的爪子']]){
  assert.ok(icon('items',id),`missing item icon: ${id}`);
  assert.match(nameOf('items',id),/[\u4e00-\u9fff]/,name);
 }
});
