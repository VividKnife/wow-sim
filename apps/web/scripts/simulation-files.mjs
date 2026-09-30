import {readFile} from 'node:fs/promises';
import version from '../../../packages/game-data/runtime/version.json' with {type:'json'};
export async function simulationFile(path){
 const match=/^\/simulation-content\/([a-f0-9]{64})\/(boot|class-(?:1|2|3|4|5|7|8|9|11)|0|[1-9]\d*)\.json\.gz$/.exec(path);
 if(!match)return new Response(null,{status:404});
 if(match[1]!==version.version)return new Response(null,{status:404});
 if(/^\d+$/.test(match[2])&&Number(match[2])>=Math.ceil(version.totalNodes/version.shardSize))return new Response(null,{status:404});
 const bytes=await readFile(new URL(`../../../packages/game-data/runtime/browser/${match[2]}.json.gz`,import.meta.url));
 return new Response(bytes,{headers:{'content-type':'application/json','content-encoding':'gzip','cache-control':'public, max-age=31536000, immutable'}});
}
