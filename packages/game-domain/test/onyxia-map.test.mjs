import test from 'node:test';
import assert from 'node:assert/strict';
import {onyxiaMap,onyxiaRoute} from '../src/rules/onyxia-content.js';

test('Onyxia entrance, warders and boss follow the visible right-hand cave',()=>{
 assert.deepEqual(onyxiaRoute.map(node=>node.id),['onyxia-warders','onyxia']);
 const {entrance,'onyxia-warders':warders,onyxia:boss}=onyxiaMap.points;
 assert.ok(entrance[0]>550&&entrance[1]>540);
 assert.ok(warders[0]>500&&warders[0]<600&&warders[1]>400&&warders[1]<500);
 assert.ok(boss[0]>600&&boss[0]<750&&boss[1]>140&&boss[1]<300);
 for(const [a,b] of onyxiaMap.edges){
  const path=onyxiaMap.edgePaths[`${a}:${b}`];
  assert.deepEqual(path[0],onyxiaMap.points[a]);
  assert.deepEqual(path.at(-1),onyxiaMap.points[b]);
  assert.ok(path.length>2);
 }
});
