import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HeadObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {parseTree,contentType,publicReleaseDigest,publishWeb,webDigest} from './publish-r2-assets.mjs';
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
test('public release reuse depends on the asset tree rather than the source commit',()=>{
  const release={version:'tree',prefix:'public/tree',files:12,bytes:345};
  assert.equal(publicReleaseDigest({...release,commit:'first'}),publicReleaseDigest({...release,commit:'second'}));
  assert.notEqual(publicReleaseDigest(release),publicReleaseDigest({...release,bytes:346}));
});
test('an identical immutable web release writes a local receipt without uploading any object',async()=>{
  const root=await mkdtemp(join(tmpdir(),'wow-r2-reuse-'));
  try{
    const directory=join(root,'apps/web/dist');await mkdir(join(directory,'assets'),{recursive:true});
    const metadata={commit:'source',publicAssetVersion:'public',assetMode:'r2',buildId:'source',assetBase:'https://cdn.test/web/source/'};
    await writeFile(join(directory,'__deployment.json'),JSON.stringify(metadata));
    await writeFile(join(directory,'index.html'),'<script src="assets/app.js"></script>');
    await writeFile(join(directory,'assets/app.js'),'export const ready=true;');
    const digest=await webDigest(directory),commands=[];
    const client={send:async command=>{
      commands.push(command);
      if(command instanceof HeadObjectCommand)return {Metadata:{'build-digest':digest}};
      if(command instanceof PutObjectCommand)throw new Error('identical objects must not be uploaded');
      throw new Error(`unexpected command: ${command.constructor.name}`);
    }};
    const result=await publishWeb(client,'bucket','source','public',root);
    assert.equal(result.reused,true);
    assert.equal(commands.length,1);
    assert.deepEqual(JSON.parse(await readFile(join(directory,'.r2-upload.json'),'utf8')),{...metadata,files:3,digest});
  }finally{await rm(root,{recursive:true,force:true});}
});
