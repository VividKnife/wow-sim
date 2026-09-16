import test from 'node:test';import assert from 'node:assert/strict';
test('racial weapon skills and resistance are restricted to their actual race',async()=>{
 const racial=await import('../lib/game/racial-effects.js').catch(()=>({}));assert.equal(typeof racial.racialModifiers,'function');
 assert.equal(racial.racialModifiers({raceId:1}).weaponSkillBySubclass[7],5);assert.equal(racial.racialModifiers({raceId:1}).weaponSkillBySubclass[0]||0,0);
 assert.equal(racial.racialModifiers({raceId:2}).stunResistance,.25);assert.equal(racial.racialModifiers({raceId:3}).resistances[4],10);
});
test('Berserking scales from ten to thirty percent haste using activation health',async()=>{
 const racial=await import('../lib/game/racial-effects.js').catch(()=>({}));assert.equal(typeof racial.activateRacial,'function');
 for(const[hp,expected]of [[100,.1],[40,.3]]){const c={raceId:8,hp,time:0},s={clock:0};assert.equal(racial.activateRacial(s,c,{Id:26297,SpellName:'Berserking'},{stats:()=>({maxHp:100})}),true);assert.equal(racial.racialModifiers(c).meleeHastePct,expected);c.hp=100;assert.equal(racial.racialModifiers(c).castHastePct,expected);}
});
test('Cannibalize heals in five two-second ticks and damage cancels it',async()=>{
 const racial=await import('../lib/game/racial-effects.js').catch(()=>({}));assert.equal(typeof racial.tickRacialEffects,'function');
 const c={id:'undead',raceId:5,hp:20,position:0,time:0},s={clock:0,combat:{enemies:[{hp:0,entry:6,creatureType:7,position:2}]}},api={stats:()=>({maxHp:100}),healAmount:(s,c,t,a)=>t.hp+=a};
 assert.equal(racial.activateRacial(s,c,{Id:20577,SpellName:'Cannibalize'},api),true);s.clock=4000;racial.tickRacialEffects(s,c,api);assert.equal(c.hp,34);c.cannibalize=null;s.clock=10000;racial.tickRacialEffects(s,c,api);assert.equal(c.hp,34);
});
