import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import version from '../../../../../../../packages/game-data/runtime/version.json' with {type:'json'};

export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{version:string;pack:string}>}){
 const requested=await params;
 if(requested.version!==version.version)return Response.json({error:'规则版本已更新'},{status:409});
 const count=Math.ceil(version.totalNodes/version.shardSize);
 if(requested.pack!=='boot'&&!/^class-(1|2|3|4|5|7|8|9|11)$/.test(requested.pack)&&(!/^(0|[1-9]\d*)$/.test(requested.pack)||Number(requested.pack)>=count))return new Response(null,{status:404});
 const filename=`${requested.pack}.json.gz`;
 let data:Buffer|undefined;
 for(const root of [resolve(process.cwd(),'packages/game-data/runtime/browser'),resolve(process.cwd(),'../../packages/game-data/runtime/browser')]){
  try{data=await readFile(resolve(root,filename));break;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 }
 if(!data)return new Response(null,{status:503});
 return new Response(new Uint8Array(data),{headers:{'Content-Type':'application/json','Content-Encoding':'gzip','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
}
