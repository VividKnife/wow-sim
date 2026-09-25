import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

for(const [name,rows] of [['characters',8],['forms',3]])test(`${name} atlas has complete transparent, isolated animation cells`,async()=>{
 const {data,info}=await sharp(fileURLToPath(new URL(`../public/battle/hd2d/${name}.png`,import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,768);assert.equal(info.height,rows*128);assert.equal(info.channels,4);
 for(let row=0;row<rows;row++)for(let col=0;col<6;col++){
  let content=0;
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
   const alpha=data[((row*128+y)*info.width+col*128+x)*4+3];
   if(alpha>50)content++;
   if(x<2||x>=126||y<2||y>=126)assert.equal(alpha,0,`${name} ${row}:${col} must not bleed into adjacent cells`);
  }
  assert.ok(content>300,`${name} ${row}:${col} must contain a complete pose`);
 }
});
