import test from 'node:test';
import assert from 'node:assert/strict';
import {flightNodes,flights,nodes,creatures,creatureLocations} from '../src/rules/catalog.js';
import {createGame,view} from '../src/rules/engine.js';

test('Classic flight point locations match the playable world',()=>{
 for(const id of ['ruttheran','moonglade','thalanaar','marshals-refuge','orgrimmar-district-1']){
  assert.ok(flightNodes.includes(id),`${id} should have a flight point`);
  assert.ok(flights.some(route=>route.a===id||route.b===id),`${id} needs a route`);
 }
 for(const id of ['razor-hill','darnassus','orgrimmar','bulwark','emerald-sanctuary']){
  assert.ok(!flightNodes.includes(id),`${id} should not have a flight point`);
  assert.ok(!flights.some(route=>route.a===id||route.b===id),`${id} should not have a flight route`);
 }
 const masters=Object.values(creatures).filter(creature=>creature.NpcFlags&8);
 for(const id of flightNodes){
  assert.ok(masters.some(creature=>creatureLocations[creature.Entry]?.includes(id)),`${id} needs a local flight master`);
 }
 for(const id of ['ruttheran','moonglade','thalanaar','orgrimmar-district-1','ratchet','marshals-refuge']){
  const game=createGame('飞行点检查',42,0);
  game.location=id;
  const screen=view(game);
  assert.equal(screen.hasFlight,true,`${nodes[id].name} should offer flights`);
  assert.ok(screen.flight.routes.length>0);
  assert.ok(screen.interactions.some(npc=>npc.roles.includes('flight')));
 }
 const darnassus=createGame('飞行点检查',42,0);
 darnassus.location='darnassus';
 const city=view(darnassus).city;
 assert.ok(city.departures.some(destination=>destination.to==='ruttheran'));
 assert.ok(city.districts.every(district=>district.services.every(service=>service.id!=='flight')));
 const orgrimmar=createGame('飞行点检查',43,0,{raceId:2,classId:1});
 orgrimmar.location='orgrimmar-district-1';
 const orgrimmarCity=view(orgrimmar).city;
 assert.equal(orgrimmarCity.flightNode,'orgrimmar-district-1');
 assert.ok(orgrimmarCity.districts.find(district=>district.id==='orgrimmar-district-1').services.some(service=>service.id==='flight'));
});
