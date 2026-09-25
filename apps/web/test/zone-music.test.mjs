import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createZoneMusic,zoneMusicForLocation} from '../lib/zone-music.js';
import {nodes} from '../../../packages/game-domain/src/rules/catalog.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(play=()=>Promise.resolve()){
 const voices=[],statuses=[];
 const player=createZoneMusic({onStatus:s=>statuses.push(s),createAudio:src=>{
  const voice={src,plays:0,pauses:0,play(){this.plays++;return play();},pause(){this.pauses++;},removeAttribute(){},load(){}};
  voices.push(voice);return voice;
 }});
 return {player,voices,statuses};
}
test('all current locations resolve to verified local music',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../../docs/research/import/zone-music/manifest.json',import.meta.url)));
 const evidence=readFileSync(new URL('../../../docs/research/import/zone-music/source.html',import.meta.url));
 assert.equal(createHash('sha256').update(evidence).digest('hex'),manifest.sourceSha256);
 const paths=new Set(manifest.tracks.map(t=>'/'+t.path));
 for(const node of Object.values(nodes))assert.ok(paths.has(zoneMusicForLocation(node)),node.id);
 assert.equal(zoneMusicForLocation(nodes.northshire),zoneMusicForLocation(nodes.goldshire));
 assert.equal(zoneMusicForLocation(nodes.deadmines,true),'/music/deadmines.mp3');
 assert.equal(zoneMusicForLocation({id:'unknown',region:'unknown'}),null);
 for(const track of manifest.tracks){
  const bytes=readFileSync(new URL('../public/'+track.path,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),track.sha256);
  assert.ok(track.durationSeconds>1);
 }
});
test('default playback loops quietly, same region does not restart, switching stops old audio',async()=>{
 const {player,voices}=fixture();
 player.setSource('/music/forest.mp3');await flush();
 assert.equal(voices.length,1);assert.equal(voices[0].loop,true);assert.equal(voices[0].volume,.25);
 player.setSource('/music/forest.mp3');player.retry();assert.equal(voices[0].plays,1);
 player.setSource('/music/westfall.mp3');assert.equal(voices[0].pauses,1);assert.equal(voices.length,2);
 player.dispose();assert.equal(voices[1].pauses,1);player.retry();assert.equal(voices.length,2);
});
test('autoplay rejection retries on interaction; disabled/hidden playback stays silent',async()=>{
 let blocked=true;
 const {player,voices,statuses}=fixture(()=>blocked?Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'})):Promise.resolve());
 player.setSource('/music/forest.mp3');await flush();assert.equal(statuses.at(-1),'blocked');
 blocked=false;player.retry();await flush();assert.equal(statuses.at(-1),'playing');
 player.setEnabled(false);player.retry();assert.equal(voices.length,1);
 player.setSource('/music/westfall.mp3');assert.equal(voices.length,1);
 player.setActive(false);player.setEnabled(true);assert.equal(voices.length,1);
 player.setActive(true);await flush();assert.equal(voices.length,2);
 player.setSource(null);assert.equal(voices[1].pauses,1);player.dispose();
});
test('late promise completion cannot change current track status',async()=>{
 let reject;
 const {player,statuses}=fixture(()=>new Promise((_resolve,r)=>{reject=r;}));
 player.setSource('/music/forest.mp3');const oldReject=reject;
 player.setSource('/music/westfall.mp3');oldReject(Object.assign(new Error(),{name:'NotAllowedError'}));
 await flush();assert.equal(statuses.at(-1),'ready');player.dispose();
});
test('volume changes immediately without restarting and survives track changes and mute',async()=>{
 const {player,voices}=fixture();
 player.setVolume(.6);player.setSource('/music/forest.mp3');await flush();
 assert.equal(voices[0].volume,.6);
 player.setVolume(.8);assert.equal(voices[0].volume,.8);assert.equal(voices[0].plays,1);
 player.setSource('/music/westfall.mp3');assert.equal(voices[1].volume,.8);
 player.setEnabled(false);player.setVolume(0);player.setEnabled(true);assert.equal(voices[2].volume,0);
 player.setVolume(2);assert.equal(voices[2].volume,1);
 player.setVolume(NaN);assert.equal(voices[2].volume,1);
 player.setVolume(-1);assert.equal(voices[2].volume,0);
 player.dispose();
});
