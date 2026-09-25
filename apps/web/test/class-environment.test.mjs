import test from 'node:test';import assert from 'node:assert/strict';
const state=(raceId=1)=>({id:'player',raceId,classId:8,hp:100,level:60,location:'mirror',clock:0,party:[],learned:[],visited:['mirror','crystal'],environment:{mode:'shore',breathMs:60000,lastTick:0}});
test('water movement rejects dry land and submerged characters consume breath',async()=>{
 const env=await import('../../../packages/game-domain/src/rules/class-environment.js').catch(()=>({}));assert.equal(typeof env.environmentAction,'function');const s=state();s.location='northshire';assert.throws(()=>env.environmentAction(s,{mode:'dive'}));s.location='mirror';env.environmentAction(s,{mode:'dive'});s.clock=10000;env.environmentTick(s,{stats:()=>({maxHp:100})});assert.equal(s.environment.breathMs,50000);env.environmentAction(s,{mode:'surface'});s.clock=20000;env.environmentTick(s,{stats:()=>({maxHp:100})});assert.equal(s.environment.breathMs,60000);
});
test('underwater breathing prevents drowning and undead breath lasts four times longer',async()=>{
 const env=await import('../../../packages/game-domain/src/rules/class-environment.js').catch(()=>({}));assert.equal(typeof env.executeEnvironmentSpell,'function');const {spells}=await import('../../../packages/game-domain/src/rules/catalog.js');const undead=state(5);env.environmentAction(undead,{mode:'dive'});assert.equal(undead.environment.breathMs,240000);const s=state();env.environmentAction(s,{mode:'dive'});env.executeEnvironmentSpell(s,s,s,spells[5697]);s.clock=120000;let damage=0;env.environmentTick(s,{stats:()=>({maxHp:100}),hurtPlayer:()=>damage++});assert.equal(damage,0);assert.equal(s.environment.breathMs,60000);
});
test('source Safe Fall and Slow Fall reduce only game-generated landing damage',async()=>{
 const env=await import('../../../packages/game-domain/src/rules/class-environment.js').catch(()=>({}));assert.equal(typeof env.environmentTick,'function');const {spells}=await import('../../../packages/game-domain/src/rules/catalog.js');const simulate=(learned,buff)=>{const s=state();s.learned=learned;s.fall={height:40,landAt:1000};if(buff)env.executeEnvironmentSpell(s,s,s,spells[buff]);s.clock=1000;let damage=0;env.environmentTick(s,{stats:()=>({maxHp:100}),hurtPlayer:(s,e,c,a)=>damage+=a});return damage;};assert.ok(simulate([],0)>simulate([1860],0));assert.equal(simulate([],130),0);
});
test('damage removes source-sensitive Levitate and Water Walking but preserves Slow Fall',async()=>{
 const env=await import('../../../packages/game-domain/src/rules/class-environment.js');const {spells}=await import('../../../packages/game-domain/src/rules/catalog.js');const s=state();for(const id of [130,1706,546])env.executeEnvironmentSpell(s,s,s,spells[id]);env.environmentDamage(s);assert.deepEqual(s.environmentBuffs.map(b=>b.spell),[130]);
});
test('public dive and advance enter death state with one drowning death',async()=>{
 const {createGame,act,advance}=await import('../../../packages/game-domain/src/rules/engine.js');let s=createGame('溺水验证',17,0,{classId:1,raceId:1});s.location='mirror';s=act(s,{type:'environment',mode:'dive'},0);s=advance(s,72000).state;assert.equal(s.hp,0);assert.equal(s.activity.type,'dead');assert.equal(s.totals.deaths,1);
});
test('public underwater continuation is identical after JSON restore',async()=>{
 const {createGame,act,advance}=await import('../../../packages/game-domain/src/rules/engine.js');let s=createGame('呼吸存档',17,0,{classId:1,raceId:5});s.location='mirror';s=act(s,{type:'environment',mode:'dive'},0);const whole=advance(s,40000).state,split=advance(JSON.parse(JSON.stringify(advance(s,17000).state)),40000).state;assert.deepEqual(split,whole);assert.equal(whole.environment.breathMs,200000);
});
test('environment spell availability is a read-only view',async()=>{
 const {environmentSpellUse}=await import('../../../packages/game-domain/src/rules/class-environment.js');const {spells}=await import('../../../packages/game-domain/src/rules/catalog.js');const s=state();delete s.environment;const before=JSON.stringify(s);environmentSpellUse(s,spells[1066]);assert.equal(JSON.stringify(s),before);
});
test('repeating dive does not postpone an already scheduled drowning pulse',async()=>{
 const env=await import('../../../packages/game-domain/src/rules/class-environment.js');const s=state();s.environment={mode:'underwater',breathMs:0,lastTick:0,nextDrown:500};env.environmentAction(s,{mode:'dive'});assert.equal(s.environment.nextDrown,500);
});
