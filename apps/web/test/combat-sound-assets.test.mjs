import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../docs/research/import/combat-sounds/',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('each added combat sound retains verified Classic source bytes and Vanilla filename membership',()=>{
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',root))),list=readFileSync(new URL('vanilla-sound-paths.csv',root));
 assert.equal(hash(list),manifest.vanillaList.sha256);assert.equal(manifest.sounds.length,15);
 for(const sound of manifest.sounds){
  const bytes=readFileSync(new URL('../public/'+sound.path,import.meta.url));
  assert.equal(bytes.subarray(0,4).toString(),'OggS',sound.id);
  assert.equal(hash(bytes),sound.sha256,sound.id);assert.equal(bytes.length,sound.bytes);
  assert.ok(list.toString().includes(sound.vanillaPath));assert.ok(sound.durationSeconds>0&&sound.durationSeconds<15);
  const page=readFileSync(new URL(`spell-${sound.sourcePage.split('spell=')[1]}.html`,root));
  assert.equal(hash(page),sound.sourcePageSha256);
  const records=[...page.toString().matchAll(/\{"id":\d+,"title":"[^"]+","url":"[^"]+","type":"(?:\\.|[^"])*"\}/g)].map(match=>JSON.parse(match[0]));
  assert.equal(records.find(record=>record.id===sound.fileDataId)?.url,sound.url);
 }
});
