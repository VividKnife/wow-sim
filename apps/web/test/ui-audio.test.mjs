/* global URL */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {playUiSound,uiSoundForButton} from '../lib/ui-audio.js';

test('interface cues honor effect settings and use the expected files',()=>{
 const played=[];
 const createAudio=src=>({volume:0,play(){played.push([src,this.volume]);return Promise.resolve();}});
 assert.equal(playUiSound('open',{createAudio,enabled:false,volume:1}),false);
 assert.equal(playUiSound('next',{createAudio,enabled:true,volume:0}),false);
 assert.equal(playUiSound('close',{createAudio,enabled:true,volume:.6}),true);
 assert.deepEqual(played,[['/sounds/ui-menu-close.ogg',.27]]);
});

test('navigation and pagination only sound on enabled changes',()=>{
 const button=({label='',text='',disabled=false,pressed=null,tab=false,active=false,container=''})=>({
  disabled,textContent:text,
  getAttribute(name){return name==='aria-label'?label:name==='aria-disabled'?null:name==='aria-pressed'?pressed:name==='data-state'?active?'active':'inactive':null;},
  matches(selector){return selector==='[role="tab"]'&&tab;},
  hasAttribute(name){return name==='aria-pressed'&&pressed!==null;},
  closest(selector){
   if(selector.startsWith('[class*="pagination"]'))return container==='pagination'?{}:null;
   if(selector==='.main-nav,.cu-menu,.cu-dialog-header')return container==='main-nav'?{}:null;
   return container==='character-sections'?{}:null;
  },
 });
 assert.equal(uiSoundForButton(button({container:'pagination',label:'上一页'})),'previous');
 assert.equal(uiSoundForButton(button({container:'pagination',text:'下一页'})),'next');
 assert.equal(uiSoundForButton(button({container:'pagination',text:'下一页',disabled:true})),null);
 assert.equal(uiSoundForButton(button({tab:true})), 'switch');
 assert.equal(uiSoundForButton(button({tab:true,active:true})),null);
 assert.equal(uiSoundForButton(button({container:'character-sections',pressed:'false'})),'switch');
 assert.equal(uiSoundForButton(button({container:'character-sections',pressed:'true'})),null);
 assert.equal(uiSoundForButton(button({container:'main-nav',tab:true})),null);
});

test('imported interface sounds are OGG files with recorded hashes',async()=>{
 const {createHash}=await import('node:crypto');
 const manifest=JSON.parse(readFileSync(new URL('../../../docs/research/import/ui-sounds.json',import.meta.url)));
 for(const entry of manifest.sounds){
  const bytes=readFileSync(new URL(`../public/sounds/${entry.cue}.ogg`,import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'OggS');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
 }
});
