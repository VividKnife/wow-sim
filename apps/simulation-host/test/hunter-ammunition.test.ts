import test from 'node:test';
import assert from 'node:assert/strict';
import {ResidentInstance} from '../src/instance.ts';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {restockHunterAmmo} from '../../web/lib/ammo-restock.js';
import {addItem} from '../../../packages/game-domain/src/rules/character.js';
import {ammoCount} from '../../../packages/game-domain/src/rules/ammunition.js';
import {validateRuleAction, type RuleAction} from '../../../packages/protocol/src/rule-action.ts';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import type {SimulationInput} from '../../../packages/protocol/src/simulation.ts';

function fixture() {
  const state: Rules = createGame('Archer', 12345, 0, {characterId: 'hunter', classId: 3, raceId: 2});
  state.location = 'northwood'; state.money = 1000; state.ammunition = {};
  addItem(state, 2512, 200, false);
  const runtime = new ResidentInstance({instanceId: 'ammo', ownerEpoch: 1, state,
    controllers: [{actorId: state.id, accountId: 'alice', generation: 1, canPause: true}]});
  let sequence = 0;
  const input = (action: RuleAction): SimulationInput => ({instanceId: 'ammo', actorId: state.id,
    controllerGeneration: 1, clientSequence: ++sequence, requestId: `ammo-${sequence}`, command: {kind: 'action', action}});
  const send = (target: ResidentInstance, action: RuleAction) => {
    const receipt = target.input('alice', input(action));
    assert.equal(receipt.status, 'applied', receipt.reason);
  };
  const finishTravel = (target: ResidentInstance) => {
    const state = target.checkpoint().state;
    const arrival = state.wallAt + state.activity.endsAt - state.clock;
    for (let turn = 0; turn < 1000; turn++) if (target.advance(arrival).complete) return;
    assert.fail('travel did not complete within the turn budget');
  };
  const returnToTown = (target: ResidentInstance) => {
    send(target, {type: 'travel', to: 'northshire'});
    finishTravel(target);
  };
  return {runtime, input, send, returnToTown, finishTravel};
}

test('ammo settings survive resident restoration; only client shop requests purchase and load ammunition', async () => {
  const {runtime, input, send, returnToTown} = fixture();
  send(runtime, {type: 'ammoSettings', memberId: 'hunter', enabled: true, target: 800});
  assert.equal(runtime.checkpoint().state.money, 1000, 'saving settings does not purchase ammunition');
  const restored = ResidentInstance.restore(JSON.parse(JSON.stringify(runtime.checkpoint())), 2);
  returnToTown(restored);
  assert.equal(restored.checkpoint().state.money,1000);
  assert.equal(ammoCount(restored.checkpoint().state),0,'offline arrival does not buy ammunition');
  await refill(restored,send,800);
  const state = restored.checkpoint().state;
  assert.deepEqual(state.ammoPolicy, {enabled: true, target: 800});
  assert.equal(ammoCount(state), 800);
  assert.equal(state.money, 970);
  assert.equal(state.ammoRestockPrompt, undefined);
  for (const target of [0, 10001, 1.5]) {
    const receipt = restored.input('alice', input({type: 'ammoSettings', memberId: 'hunter', enabled: true, target}));
    assert.equal(receipt.status, 'rejected');
  }
  assert.deepEqual(restored.checkpoint().state, state, 'invalid quantities leave the saved policy and assets unchanged');
});

test('town prompt purchases through ordinary buy and load inputs without duplicate charges', async () => {
  const {runtime, input, send, returnToTown, finishTravel} = fixture();
  returnToTown(runtime);
  assert.equal(runtime.checkpoint().state.ammoRestockPrompt.memberId, 'hunter');
  const request = input({type: 'buy', id: 2512, count: 1});
  const receipt = runtime.input('alice', request);
  assert.equal(receipt.status, 'applied', receipt.reason);
  assert.deepEqual(runtime.input('alice', request), receipt);
  await refill(runtime,send,400);
  const state = runtime.checkpoint().state;
  assert.equal(ammoCount(state), 400);
  assert.equal(state.money, 990);
  assert.equal(state.ammoRestockPrompt, undefined);
  send(runtime, {type: 'ammoSettings', memberId: 'hunter', enabled: false, target: 1200});
  send(runtime, {type: 'travel', to: 'northwood'});
  finishTravel(runtime);
  returnToTown(runtime);
  assert.equal(runtime.checkpoint().state.money, 990);
  assert.equal(ammoCount(runtime.checkpoint().state), 400);
});

test('resident loading consumes a bag stack exactly once and ammo commands reject extra client fields', () => {
  const {runtime, input, send} = fixture();
  const uid = runtime.checkpoint().state.bag.find((item: Rules) => item.id === 2512).uid;
  send(runtime, {type: 'loadAmmo', memberId: 'hunter', uid});
  const state = runtime.checkpoint().state;
  assert.equal(ammoCount(state), 200);
  assert.ok(!state.bag.some((item: Rules) => item.uid === uid));
  assert.equal(runtime.input('alice', input({type: 'loadAmmo', memberId: 'hunter', uid})).status, 'rejected');
  assert.deepEqual(runtime.checkpoint().state, state);
  for (const action of [
    {type: 'ammoSettings', memberId: 'hunter', enabled: true, target: 400},
    {type: 'buy', id: 2512, count: 1},
    {type: 'loadAmmo', memberId: 'hunter', uid},
  ]) assert.throws(() => validateRuleAction({...action, money: 100000}), /fields/);
});

async function refill(runtime:ResidentInstance,send:(runtime:ResidentInstance,action:RuleAction)=>void,target:number){
  const getSnapshot=()=>{const player=runtime.checkpoint().state;return {player,view:view(player)};};
  await restockHunterAmmo({getSnapshot,send:async(action:RuleAction)=>{send(runtime,action);return true;},
    actorId:'hunter',memberId:'hunter',visit:getSnapshot().view.ammoPrompt.visit,target});
  send(runtime,{type:'ammoSettings',memberId:'hunter',enabled:true,target});
}
