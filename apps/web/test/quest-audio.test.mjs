import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {playQuestSound,questSoundForCommand} from '../lib/quest-audio.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('quest commands map to the original accept and completion cues',()=>{
 assert.equal(questSoundForCommand({type:'accept'}),'quest-accept');
 assert.equal(questSoundForCommand({type:'turnin'}),'quest-complete');
 assert.equal(questSoundForCommand({type:'abandon'}),null);
});

test('quest audio uses the public assets and does not interrupt commands when playback is blocked',async()=>{
 const voices=[];
 const createAudio=src=>{const voice={src,volume:0,play(){return Promise.reject(new Error('blocked'));}};voices.push(voice);return voice;};
 assert.equal(playQuestSound({type:'accept'},{createAudio,enabled:true,volume:.7}),true);
 assert.equal(playQuestSound({type:'turnin'},{createAudio,enabled:true,volume:.7}),true);
 assert.equal(playQuestSound({type:'travel'},{createAudio,enabled:true,volume:.7}),false);
 assert.deepEqual(voices.map(({src,volume})=>({src,volume})),[
  {src:'/sounds/quest-accept.ogg',volume:.35},
  {src:'/sounds/quest-complete.ogg',volume:.35},
 ]);
 await Promise.resolve();
});

test('quest cues retain their catalogued original Classic interface assets',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../../packages/game-data/data/world-assets-manifest.json',import.meta.url)));
 const expected={
  'quest-accept':{title:'iQuestActivate',vanillaPath:'sound\\interface\\iquestactivate.wav'},
  'quest-complete':{title:'iQuestComplete',vanillaPath:'sound\\interface\\iquestcomplete.wav'},
 };
 for(const [id,source]of Object.entries(expected)){
  const record=manifest.sounds.find(sound=>sound.id===id),bytes=readFileSync(new URL(`../public/${record.path}`,import.meta.url));
  assert.equal(record.title,source.title);assert.equal(record.vanillaPath,source.vanillaPath);
  assert.equal(bytes.subarray(0,4).toString(),'OggS');assert.equal(bytes.length,record.bytes);assert.equal(hash(bytes),record.sha256);
 }
});

 test('global effects mute suppresses quest cues and volume scales them',()=>{
 const voices=[];const createAudio=src=>{const voice={src,volume:0,play(){}};voices.push(voice);return voice;};
 assert.equal(playQuestSound({type:'accept'},{createAudio,enabled:false,volume:1}),false);
 assert.equal(voices.length,0);
 assert.equal(playQuestSound({type:'accept'},{createAudio,enabled:true,volume:.4}),true);
 assert.equal(voices[0].volume,.2);
 });
