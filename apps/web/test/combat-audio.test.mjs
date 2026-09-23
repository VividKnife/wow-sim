import test from 'node:test';
import assert from 'node:assert/strict';
import {combatSoundForEvent,createCombatAudio} from '../lib/combat-audio.js';

test('melee, healing and spell events never use a UI click as a combat fallback',()=>{
 assert.equal(combatSoundForEvent({kind:'damage',amount:12}),'melee-swing');
 assert.equal(combatSoundForEvent({kind:'incoming',amount:12}),'melee-swing');
 assert.equal(combatSoundForEvent({kind:'heal',spellId:2050},{nameEn:'Lesser Heal'}),'heal-impact');
 assert.equal(combatSoundForEvent({kind:'cast',spellId:133,school:2}),'fire-cast');
 assert.equal(combatSoundForEvent({kind:'damage',spellId:116},{school:4}),'frost-impact');
 assert.equal(combatSoundForEvent({kind:'damage',spellId:78},{nameEn:'Heroic Strike'}),'heroic-impact');
 assert.equal(combatSoundForEvent({kind:'damage',spellId:1752},{nameEn:'Sinister Strike'}),'sinister-impact');
 assert.equal(combatSoundForEvent({kind:'damage',spellId:9999}),null);
});

test('periodic damage and regeneration do not replay impact sounds on each tick',()=>{
 assert.equal(combatSoundForEvent({kind:'damage',spellId:133,school:2,periodic:true}),null);
 assert.equal(combatSoundForEvent({kind:'heal',spellId:139},{nameEn:'Renew'}),null);
 assert.equal(combatSoundForEvent({kind:'cast',spellId:139},{nameEn:'Renew'}),'renew');
 assert.equal(combatSoundForEvent({kind:'launch',spellId:133,school:2}),null);
 assert.equal(combatSoundForEvent({kind:'damage',spellId:5143,periodic:true},{nameEn:'Arcane Missiles',school:6}),'arcane-impact');
});

function harness(options={}){
 const voices=[];let time=1000;
 const player=createCombatAudio({now:()=>time,createAudio:src=>{
  const voice={src,volume:0,currentTime:0,paused:false,onended:null,onerror:null,play(){return Promise.resolve();},pause(){this.paused=true;}};
  voices.push(voice);return voice;
 },...options});
 return {player,voices,advance:ms=>time+=ms};
}

test('volume changes apply to active voices and clamp invalid settings',()=>{
 const {player,voices}=harness();player.setActive(true);player.setEnabled(true);player.setVolume(.5);
 player.play('fire-cast');player.play('melee-swing');assert.equal(voices[0].volume,.11);assert.equal(voices[1].volume,.06);
 player.setVolume(2);assert.equal(voices[0].volume,.22);assert.equal(voices[1].volume,.12);
 player.setVolume(NaN);assert.ok(voices.every(v=>v.volume===0));player.dispose();
});
test('audio is opt-in, voice-limited, rate-limited and fully stopped by mute or close',()=>{
 const {player,voices,advance}=harness();
 player.play('fire-cast');assert.equal(voices.length,0);
 player.setActive(true);player.setEnabled(true);player.play('fire-cast');player.play('fire-cast');
 assert.equal(voices.length,1);
 for(const id of ['frost-cast','heal-impact','melee-swing','holy-cast'])player.play(id);
 assert.equal(voices.filter(v=>!v.paused).length,4);
 player.setActive(false);assert.ok(voices.every(v=>v.paused));
 const count=voices.length;player.play('fire-cast');assert.equal(voices.length,count);
 player.setActive(true);advance(200);player.play('fire-cast');assert.equal(voices.length,count+1);
 player.setEnabled(false);assert.ok(voices.every(v=>v.paused));player.dispose();
});
test('ended and browser-blocked voices release their slots',async()=>{
 const {player,voices}=harness();player.setActive(true);player.setEnabled(true);
 player.play('fire-cast');voices[0].onended();assert.equal(player.activeCount,0);
 const denied=harness({createAudio:()=>({play:()=>Promise.reject(new Error('autoplay blocked')),pause(){}})}).player;
 denied.setActive(true);denied.setEnabled(true);denied.play('fire-cast');await Promise.resolve();await Promise.resolve();
 assert.equal(denied.activeCount,0);denied.dispose();
});

test('a slow download is cancelled instead of playing an old cue after its deadline',()=>{
 const pending=new Map();let next=0;
 const {player,voices}=harness({schedule:fn=>{pending.set(++next,fn);return next;},cancel:id=>pending.delete(id)});
 player.setActive(true);player.setEnabled(true);player.play('heal-impact');
 assert.equal(pending.size,1);
 [...pending.values()][0]();
 assert.equal(player.activeCount,0);assert.equal(voices[0].paused,true);
 player.play('fire-impact');voices[1].onplaying();
 assert.equal(pending.size,0);assert.equal(player.activeCount,1);
 player.dispose();assert.equal(player.activeCount,0);
});
