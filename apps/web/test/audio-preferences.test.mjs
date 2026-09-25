import test from 'node:test';
import assert from 'node:assert/strict';
import {readAudioPreference,writeAudioPreference,subscribeAudioPreferences} from '../lib/audio-preferences.js';
test('audio preferences notify mounted players, persist, clamp volume and unsubscribe',()=>{
 const store=new Map(),target=new EventTarget();
 globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
 globalThis.window=target;
 try{
  let updates=0;const unsubscribe=subscribeAudioPreferences(()=>updates++);
  assert.equal(readAudioPreference('effectsEnabled'),false);
  writeAudioPreference('effectsEnabled',true);assert.equal(readAudioPreference('effectsEnabled'),true);
  writeAudioPreference('effectsVolume',.4);assert.equal(readAudioPreference('effectsVolume'),.4);
  assert.equal(store.get('battle-volume'),'0.4');
  writeAudioPreference('musicVolume',9);assert.equal(readAudioPreference('musicVolume'),1);
  store.set('wow-sim:music-volume','invalid');assert.equal(readAudioPreference('musicVolume'),.25);
  target.dispatchEvent(new Event('storage'));assert.equal(updates,4);
  unsubscribe();writeAudioPreference('musicEnabled',false);assert.equal(updates,4);
 }finally{delete globalThis.localStorage;delete globalThis.window;}
});
