import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,view} from '../../../packages/game-domain/src/rules/engine.js';
import {addItem,countItem} from '../../../packages/game-domain/src/rules/character.js';
import {items} from '../../../packages/game-domain/src/rules/catalog.js';

test('ordinary trade materials remain bankable, sellable and tradable despite appearing in quest objectives',()=>{
 let s=createGame('材料整理',283,0);s.location='stormwind';addItem(s,2589,20);addItem(s,769,10);
 assert.equal(items[2589].class,7);assert.equal(items[2589].bonding,0);
 const linen=s.bag.find(i=>i.id===2589),meat=s.bag.find(i=>i.id===769),actions=view(s).inventoryActions;
 assert.equal(actions[linen.uid].bankable,true);assert.equal(actions[linen.uid].tradable,true);assert.equal(actions[meat.uid].protected,false);
 s=act(s,{type:'bankDeposit',uid:linen.uid,count:20},0);assert.equal(countItem(s,2589),0);assert.equal(s.bank.find(i=>i.id===2589).count,20);
 s=act(s,{type:'bankWithdraw',uid:linen.uid,count:20},0);s=act(s,{type:'auctionSell',uid:linen.uid},0);assert.equal(s.auctions[0].item.id,2589);
 const before=s.money;s=act(s,{type:'sell',uid:meat.uid},0);assert.equal(s.money-before,items[769].SellPrice*10);
});

test('actual quest items and player locks remain protected',()=>{
 let s=createGame('任务保护',283,0);s.location='stormwind';addItem(s,7207);addItem(s,2589,10);
 const flask=s.bag.find(i=>i.id===7207),linen=s.bag.find(i=>i.id===2589);s=act(s,{type:'lockItem',uid:linen.uid},0);
 for(const action of [{type:'sell',uid:flask.uid},{type:'auctionSell',uid:flask.uid},{type:'bankDeposit',uid:flask.uid,count:1},{type:'sell',uid:linen.uid},{type:'auctionSell',uid:linen.uid}])assert.throws(()=>act(s,action,0));
 assert.equal(countItem(s,7207),1);assert.equal(countItem(s,2589),10);
});
