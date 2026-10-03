import test from 'node:test';
import assert from 'node:assert/strict';
import {ResidentInstance} from '../src/instance.ts';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {restockTownSupplies,townSupplyRunKey} from '../../web/lib/town-supplies.js';
import {addItem} from '../../../packages/game-domain/src/rules/character.js';
import {ammoCount} from '../../../packages/game-domain/src/rules/ammunition.js';
import {validateRuleAction, type RuleAction} from '../../../packages/protocol/src/rule-action.ts';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import type {SimulationInput} from '../../../packages/protocol/src/simulation.ts';

function fixture() {
  const state: Rules = createGame('Archer', 12345, 0, {characterId: 'hunter', classId: 3, raceId: 2});
  state.location = 'northwood'; state.money = 1000; state.bag=[];
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

test('supply settings survive restoration and offline arrival never purchases',async()=>{
 const {runtime,send,returnToTown,input}=fixture();
 send(runtime,{type:'townSupplySettings',entries:[{key:'arrows',enabled:true,target:800}]});
 const restored=ResidentInstance.restore(JSON.parse(JSON.stringify(runtime.checkpoint())),2);
 returnToTown(restored);
 assert.equal(restored.checkpoint().state.money,1000);
 assert.equal(ammoCount(restored.checkpoint().state),200);
 const getSnapshot=()=>{const player=restored.checkpoint().state;return{player,view:view(player)};};
 await restockTownSupplies({getSnapshot,send:async(action:RuleAction)=>{send(restored,action);return true;},runKey:townSupplyRunKey(getSnapshot())});
 assert.equal(ammoCount(restored.checkpoint().state),800);
 assert.equal(restored.checkpoint().state.money,970);
 for(const target of [0,10001,1.5])assert.equal(restored.input('alice',input({type:'townSupplySettings',entries:[{key:'arrows',enabled:true,target}]})).status,'rejected');
});

test('ordinary shop requests remain idempotent and selection does not remove bag items',()=>{
 const {runtime,input,send,returnToTown}=fixture();returnToTown(runtime);
 const request=input({type:'buy',id:2512,count:1}),receipt=runtime.input('alice',request);
 assert.equal(receipt.status,'applied');assert.deepEqual(runtime.input('alice',request),receipt);
 const uid=runtime.checkpoint().state.bag.find((item:Rules)=>item.id===2512).uid;
 send(runtime,{type:'selectAmmo',uid});send(runtime,{type:'selectAmmo',uid});
 assert.equal(ammoCount(runtime.checkpoint().state),400);assert.equal(runtime.checkpoint().state.money,990);
 for(const action of [{type:'townSupplySettings',entries:[]},{type:'buy',id:2512,count:1},{type:'selectAmmo',uid}])assert.throws(()=>validateRuleAction({...action,money:100000}),/fields/);
});
