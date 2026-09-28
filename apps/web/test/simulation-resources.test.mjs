import test from 'node:test';
import assert from 'node:assert/strict';
import {usePolicyWorker} from '../lib/simulation-resources.js';

test('phones and touch tablets do not allocate a second full rule catalog',()=>{
 for(const device of [
  {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) EdgiOS/130.0',maxTouchPoints:5,hardwareConcurrency:8},
  {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15',maxTouchPoints:5,hardwareConcurrency:8},
  {userAgent:'Android',maxTouchPoints:0,hardwareConcurrency:12,deviceMemory:8},
  {hardwareConcurrency:4,deviceMemory:4},
  {hardwareConcurrency:16,deviceMemory:4},
  {},
 ])assert.equal(usePolicyWorker(device),false);
 assert.equal(usePolicyWorker({hardwareConcurrency:8,deviceMemory:8,maxTouchPoints:0}),true);
 assert.equal(usePolicyWorker({hardwareConcurrency:8,maxTouchPoints:0}),true,'desktop Safari need not expose deviceMemory');
});
