import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createLevelUpObserver,playLevelUpSound} from '../lib/level-up.js';

test('login and repeated snapshots do not play; level gains from any source do',()=>{
 const consume=createLevelUpObserver({id:'a',level:8});
 assert.equal(consume({id:'a',level:8}),null);
 assert.deepEqual(consume({id:'a',level:9}),{from:8,level:9});
 assert.equal(consume({id:'a',level:9}),null);
 assert.equal(consume({id:'a',level:8}),null);
 assert.equal(consume({id:'a',level:9}),null);
 assert.deepEqual(consume({id:'a',level:12}),{from:9,level:12});
 assert.equal(consume({id:'b',level:30}),null);
 assert.deepEqual(consume({id:'b',level:31}),{from:30,level:31});
});

test('original level-up cue respects mute and volume and tolerates autoplay rejection',async()=>{
 const voices=[];
 const createAudio=src=>{const voice={src,volume:0,play:()=>Promise.reject(new Error('blocked'))};voices.push(voice);return voice;};
 assert.equal(playLevelUpSound({createAudio,enabled:false,volume:1}),null);
 assert.equal(voices.length,0);
 assert.equal(playLevelUpSound({createAudio,enabled:true,volume:.4}),voices[0]);
 assert.equal(voices[0].src,'/sounds/level-up.ogg');
 assert.equal(voices[0].volume,.4);
 assert.equal(playLevelUpSound({createAudio:()=>{throw Error('unavailable');},enabled:true}),null);
 await Promise.resolve();
});

test('level-up sound matches the catalogued original asset',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../../packages/game-data/data/world-assets-manifest.json',import.meta.url)));
 const record=manifest.sounds.find(sound=>sound.id==='level-up');
 const bytes=readFileSync(new URL(`../public/${record.path}`,import.meta.url));
 assert.equal(record.vanillaPath,'sound\\interface\\levelup.wav');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
});
