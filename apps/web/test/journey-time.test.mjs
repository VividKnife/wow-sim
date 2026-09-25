import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyTime} from '../lib/journey-time.js';

test('epoch-based record times display a date and clock time rather than millions of minutes',()=>{
 const clock=Date.parse('2026-09-18T03:10:00Z');
 const result=journeyTime(clock-60000,{clock,wallAt:clock},'Asia/Singapore');
 assert.equal(result.label,'09/18 11:09:00');
 assert.equal(result.dateTime,'2026-09-18T03:09:00.000Z');
});

test('relative and rebased simulation clocks map to the same event time',()=>{
 const wallAt=Date.parse('2026-09-18T03:10:00Z');
 const relative=journeyTime(60000,{clock:120000,wallAt},'Asia/Singapore');
 const rebased=journeyTime(wallAt-60000,{clock:wallAt,wallAt},'Asia/Singapore');
 assert.deepEqual(relative,rebased);
});

test('record times handle midnight and missing timestamps',()=>{
 const clock=Date.parse('2026-09-17T16:00:30Z');
 assert.equal(journeyTime(clock-60000,{clock,wallAt:clock},'Asia/Singapore').label,'09/17 23:59:30');
 assert.deepEqual(journeyTime(undefined,{clock,wallAt:clock}),{label:'—',dateTime:undefined});
});
