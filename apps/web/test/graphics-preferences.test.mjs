import test from 'node:test';
import assert from 'node:assert/strict';
import {readLowEffects,writeLowEffects,readBattleZoom,writeBattleZoom,subscribeGraphicsPreferences} from '../lib/graphics-preferences.js';
test('graphics default follows mobile, explicit preferences persist across viewport and notify players',()=>{
 const store=new Map(),events=new EventTarget(),media=new EventTarget();media.matches=true;
 globalThis.window=events;window.matchMedia=()=>media;
 globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
 try{
  assert.equal(readLowEffects(),true);
  let updates=0;const unsubscribe=subscribeGraphicsPreferences(()=>updates++);
  writeLowEffects(false);assert.equal(readLowEffects(),false);assert.equal(updates,1);
  media.matches=false;writeLowEffects(true);assert.equal(readLowEffects(),true);
  events.dispatchEvent(new Event('storage'));assert.equal(updates,3);
  unsubscribe();writeLowEffects(false);assert.equal(updates,3);
 }finally{delete globalThis.window;delete globalThis.localStorage;}
});
test('battle default zoom persists and stays within the supported range',()=>{
 const store=new Map(),events=new EventTarget(),media=new EventTarget();media.matches=false;
 globalThis.window=events;window.matchMedia=()=>media;
 globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
 try{
  assert.equal(readBattleZoom(),1);
  let updates=0;const unsubscribe=subscribeGraphicsPreferences(()=>updates++);
  writeBattleZoom(1.7);assert.equal(readBattleZoom(),1.7);
  writeBattleZoom(9);assert.equal(readBattleZoom(),3);
  writeBattleZoom(.1);assert.equal(readBattleZoom(),.5);
  assert.equal(updates,3);
  unsubscribe();
 }finally{delete globalThis.window;delete globalThis.localStorage;}
});
