import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {clientContent} from '../../../packages/game-domain/src/rules/client-content.js';
import {workshopView} from '../../../packages/game-domain/src/rules/workshop.js';

test('ordinary game views omit static catalogs and full recipe quotes',()=>{
 const data=view(createGame('轻量',23,0));
 for(const key of ['items','market','enchants','bandages','potionOptions','creationOptions','recipes'])assert.equal(key in data,false,key);
 assert.ok(data.professions.length>0);
 assert.ok(data.professionRecipeCount>0);
});

test('client content is a stable versioned display catalog',()=>{
 const first=clientContent(),second=clientContent();
 assert.strictEqual(first,second);
 assert.match(first.contentVersion,/^[a-f0-9]{64}$/);
 assert.ok(first.items[118]);
 assert.ok(first.market.length>0);
 assert.ok(first.creationOptions.classes.length>0);
 assert.equal(JSON.stringify(first).includes('rngState'),false);
});

test('workshop quotes only one bounded filtered page',()=>{
 const state=createGame('工匠',29,0);
 state.level=60;
 state.professions.alchemy={skill:300,cap:300};
 const page=workshopView(state,{profession:'alchemy',page:0,pageSize:999});
 assert.equal(page.profession,'alchemy');
 assert.equal(page.pageSize,24);
 assert.ok(page.total>page.recipes.length);
 assert.equal(page.recipes.length,24);
 assert.ok(page.recipes.every(recipe=>recipe.profession==='alchemy'));
 assert.ok(page.recipes.every(recipe=>recipe.materials.every(material=>Number.isInteger(material.have)&&Number.isFinite(material.price))));
 const searched=workshopView(state,{profession:'alchemy',search:'minor healing potion',filter:'known',page:0,pageSize:24});
 assert.deepEqual(searched.recipes.map(recipe=>recipe.id),['spell-2330']);
 assert.equal(searched.total,1);
});

test('workshop clamps pages and returns empty results for unknown professions',()=>{
 const state=createGame('工匠',31,0);
 const empty=workshopView(state,{profession:'not-a-profession',page:-9,pageSize:0});
 assert.deepEqual(empty.recipes,[]);
 assert.equal(empty.total,0);
 assert.equal(empty.page,0);
 assert.equal(empty.pageSize,1);
});
