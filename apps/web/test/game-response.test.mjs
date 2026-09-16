import test from 'node:test';
import assert from 'node:assert/strict';
import {readGameResponse} from '../lib/game-response.js';

test('successful save reads preserve the server state and revision',async()=>{
 const payload={state:{level:1},view:{},revision:3};
 assert.deepEqual(await readGameResponse(Response.json(payload)),payload);
 assert.deepEqual(await readGameResponse(Response.json({state:null,view:null,revision:0})),{state:null,view:null,revision:0});
});
test('HTML and empty server failures produce a useful reconnect message',async()=>{
 for(const body of ['<!DOCTYPE html><h1>Worker unavailable</h1>',''])await assert.rejects(readGameResponse(new Response(body,{status:503})),e=>e.status===503&&/服务.*重试/.test(e.message)&&!e.message.includes('<'));
});
test('action errors and sign-in requirements retain their meaning',async()=>{
 await assert.rejects(readGameResponse(Response.json({error:'背包空间不足'},{status:400})),/背包空间不足/);
 await assert.rejects(readGameResponse(Response.json({error:'请先登录'},{status:401})),e=>e.status===401&&e.message==='请先登录');
});
test('invalid success payloads cannot replace a valid saved-game view',async()=>{
 for(const value of [null,[],{}, {state:null,revision:'3'}])await assert.rejects(readGameResponse(Response.json(value)),/存档响应.*重试/);
});
