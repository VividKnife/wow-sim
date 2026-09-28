import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buffSoundForEvent,freshBuffSounds} from '../lib/buff-audio.js';
test('buffs map to sourced sounds only on their actual effect event',()=>{
 for(const [nameEn,cue]of [['Arcane Brilliance','buff-spirit'],['Prayer of Fortitude','buff-spirit'],['Gift of the Wild','buff-spirit'],['Prayer of Spirit','buff-protection'],['Prayer of Shadow Protection','buff-protection'],['Greater Blessing of Kings','buff-blessing']]){
  assert.equal(buffSoundForEvent({kind:'buff',spellId:1},{nameEn}),cue);
  assert.equal(buffSoundForEvent({kind:'info',spellId:1},{nameEn}),null);
 }
 assert.equal(buffSoundForEvent({kind:'buff'},{nameEn:'Arcane Brilliance'}),null);
});
test('sound feed deduplicates snapshots and suppresses stale logs or command announcements',()=>{
 const skills=[{spellId:23028,nameEn:'Arcane Brilliance'}],logs=[{id:1,at:0,kind:'buff',spellId:23028},{id:2,at:4000,kind:'buff'},{id:3,at:4000,kind:'buff',spellId:23028},{id:4,at:4000,kind:'buff',spellId:23028}];
 assert.deepEqual(freshBuffSounds(logs,skills,1,4500),['buff-spirit']);
 assert.deepEqual(freshBuffSounds(logs,skills,4,4500),[]);
 assert.deepEqual(freshBuffSounds(logs,skills,0,10000),[]);
});
test('all imported buff sounds retain recorded hashes and original Vanilla filenames',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../../../docs/research/import/buff-sounds/manifest.json',import.meta.url),'utf8'));
 for(const sound of manifest.sounds){const data=await readFile(new URL('../public/sounds/'+sound.cue+'.ogg',import.meta.url));assert.equal(data.subarray(0,4).toString(),'OggS');assert.equal(createHash('sha256').update(data).digest('hex'),sound.sha256);assert.match(sound.vanillaPath,/\.wav$/i);assert.equal(sound.transformation,'none');}
});
