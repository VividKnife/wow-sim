import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTree,contentType} from './publish-r2-assets.mjs';
test('upload inventory preserves paths and rejects symlinks',()=>{
  const sha='a'.repeat(40);
  assert.deepEqual(parseTree(`100644 blob ${sha}  12\tmaps/a b.webp\0`),[{path:'maps/a b.webp',gitBlob:sha,size:12}]);
  assert.throws(()=>parseTree(`120000 blob ${sha}  12\tsecret\0`));
});
test('models, fonts and media carry browser-compatible MIME types',()=>{
  assert.equal(contentType('wolf.glb'),'model/gltf-binary');
  assert.equal(contentType('a.ogg'),'audio/ogg');
  assert.equal(contentType('a.woff2'),'font/woff2');
  assert.equal(contentType('a.svg'),'image/svg+xml');
  assert.equal(contentType('a.bin'),'application/octet-stream');
});
