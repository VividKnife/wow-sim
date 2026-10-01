import test from 'node:test';
import assert from 'node:assert/strict';
import {MinHeap} from '../scheduling/min-heap.ts';

test('indexed room deadlines move earlier and later without stale entries', () => {
  type Wake = {id: string; at: number};
  const compare = (a: Wake, b: Wake) => a.at - b.at || a.id.localeCompare(b.id);
  const heap = new MinHeap(compare, [], false, w => w.id), reference = new Map<string, Wake>();
  for (let round = 0; round < 20; round++) {
    for (let i = 0; i < 100; i++) {
      const id = 'room-' + i, value = {id, at: (i * 71 + round * 97) % 991};
      assert.deepEqual(heap.remove(id), reference.get(id));
      heap.push(value); reference.set(id, value);
    }
    assert.equal(heap.size, 100);
    assert.deepEqual(heap.peek(), [...reference.values()].sort(compare)[0]);
  }
  assert.throws(() => heap.push(reference.get('room-0')!), /Duplicate/);
  assert.equal(heap.remove('absent'), undefined);
  const actual: Wake[] = [];
  while (heap.size) actual.push(heap.pop()!);
  assert.deepEqual(actual, [...reference.values()].sort(compare));
  assert.equal(heap.remove('room-0'), undefined);
});
