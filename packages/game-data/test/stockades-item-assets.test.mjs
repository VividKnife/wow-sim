import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import stockades from '../data/stockades-reference.json' with {type:'json'};
import display from '../data/stockades-item-assets.json' with {type:'json'};

const root=new URL('../../../',import.meta.url),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('all Stockades quest objectives, rewards and unique boss equipment have Chinese names and local icons',()=>{
 const ids=new Set([2941,2942,3228]);
 for(const quest of stockades.tables.quest_template)for(const [key,id]of Object.entries(quest))if(id&&/^(SrcItemId|ReqItemId[1-4]|RewItemId[1-4]|RewChoiceItemId[1-6])$/.test(key))ids.add(id);
 for(const id of ids){const item=display.items[id];assert.ok(item,`item ${id}`);assert.match(item.nameZhCN,/[\u3400-\u9fff]/);assert.match(item.icon,/^assets\/[a-z0-9_]+\.png$/);assert.ok(readFileSync(new URL('apps/web/public/icons/'+item.icon,root)).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));}
});
test('Stockades item display sources and original icon bytes match their recorded hashes',()=>{
 const manifest=JSON.parse(readFileSync(new URL('docs/research/import/stockades-item-assets/manifest.json',root),'utf8'));
 for(const item of manifest.items){const raw=readFileSync(new URL(item.file,root));assert.equal(hash(raw),item.sha256);const source=JSON.parse(raw);assert.equal(display.items[item.itemId].nameZhCN,source.name);assert.equal(display.items[item.itemId].sourceUrl,item.url);}
 for(const asset of manifest.assets)assert.equal(hash(readFileSync(new URL(asset.file,root))),asset.sha256);
});
