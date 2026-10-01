import {S3Client, HeadObjectCommand, PutObjectCommand, ListObjectsV2Command} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const types = {'.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.ico':'image/x-icon','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.json':'application/json','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.mp4':'video/mp4','.webm':'video/webm','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
export const contentType = path => types[extname(path).toLowerCase()] || 'application/octet-stream';
const sha256 = value => createHash('sha256').update(value).digest('hex');
export const publicReleaseDigest = ({version,prefix,files,bytes}) => sha256(JSON.stringify({version,prefix,files,bytes}));
export function parseTree(output) {
  return output.trimEnd().split('\0').filter(Boolean).map(line => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\s+(\d+)\t(.+)$/.exec(line);
    if (!match) throw new Error('Public assets must be regular Git files');
    return {path:match[4], gitBlob:match[2], size:Number(match[3])};
  });
}
const git = args => execFileSync('git', args, {encoding:'utf8',maxBuffer:16*1024*1024}).trim();
export async function publishAssets({upload=false, source='HEAD', env=process.env, log=console.log}={}) {
  const commit = git(['rev-parse','--verify',`${source}^{commit}`]);
  const version = git(['rev-parse',`${commit}:apps/web/public`]);
  const files = parseTree(git(['ls-tree','-r','-l','-z',`${commit}:apps/web/public`]));
  const root = git(['rev-parse','--show-toplevel']);
  const prefix = `public/${version}`;
  const manifest = {commit,version,prefix,files:files.length,bytes:files.reduce((n,f)=>n+f.size,0)};
  // The public tree is the immutable identity. A server-only commit with the
  // same tree must reuse the existing release without listing every object.
  const manifestDigest=publicReleaseDigest(manifest);
  log(JSON.stringify({...manifest,upload}));
  if (!upload) return manifest;
  // Never label mutable working files as an immutable Git release.
  if (git(['diff',commit,'--','apps/web','packages','scripts']) || git(['ls-files','--others','--exclude-standard','apps/web','packages','scripts'])) throw new Error('Build inputs differ from source; use a clean checkout of that source');
  const account = env.R2_ACCOUNT_ID, bucket = env.R2_BUCKET;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY || (env.CLOUDFLARE_API_TOKEN && createHash('sha256').update(env.CLOUDFLARE_API_TOKEN).digest('hex'));
  if (!account || !bucket || !accessKeyId || !secretAccessKey) throw new Error('Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (or CLOUDFLARE_API_TOKEN)');
  if (!/^[a-f0-9]{32}$/.test(account)) throw new Error('Invalid R2 account ID');
  const client = new S3Client({region:'auto',endpoint:`https://${account}.r2.cloudflarestorage.com`,credentials:{accessKeyId,secretAccessKey},maxAttempts:5});
  let cursor=0, completed=0, reused=0, failure;
  try {
    try {
      const release=await client.send(new HeadObjectCommand({Bucket:bucket,Key:`${prefix}/__release.json`}));
      if(release.Metadata?.['manifest-digest']===manifestDigest){
        log(`Reused: ${prefix}; ${files.length} files`);
        await publishWeb(client,bucket,commit,version,root,log);
        return manifest;
      }
    } catch(error){if(error.$metadata?.httpStatusCode!==404)throw error;}
    const existing=new Set();
    let token;
    do {
      const page=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:`${prefix}/`,ContinuationToken:token}));
      for(const object of page.Contents || [])existing.add(object.Key);
      token=page.IsTruncated?page.NextContinuationToken:undefined;
    } while(token);
    await Promise.all(Array.from({length:32},async()=>{
      while (!failure && cursor<files.length) {
        const file=files[cursor++], Key=`${prefix}/${file.path}`;
        try {
          let exists=false;
          try {
            if(existing.has(Key)) {
            const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key}));
            exists=head.Metadata?.['git-blob']===file.gitBlob && head.ContentLength===file.size;
            }
          } catch(error) { if(error.$metadata?.httpStatusCode!==404) throw error; }
          if (exists) reused++;
          else {
            const body=await readFile(resolve(root,'apps/web/public',file.path));
            const blob=createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
            if(blob!==file.gitBlob) throw new Error(`Asset changed during upload: ${file.path}`);
            await client.send(new PutObjectCommand({Bucket:bucket,Key,Body:body,ContentType:contentType(file.path),CacheControl:'public, max-age=31536000, immutable',Metadata:{'git-blob':file.gitBlob}}));
          }
          completed++;
          if(completed%250===0 || completed===files.length) log(`R2 ${completed}/${files.length}; reused ${reused}`);
        } catch(error) { failure=error; }
      }
    }));
    if(failure) throw failure;
    // Readiness marker is written only after every object succeeded. No deletions.
    await client.send(new PutObjectCommand({Bucket:bucket,Key:`${prefix}/__release.json`,Body:JSON.stringify(manifest),ContentType:'application/json',CacheControl:'no-store',Metadata:{'manifest-digest':manifestDigest}}));
    await publishWeb(client,bucket,commit,version,root,log);
    log(`Ready: ${prefix}/__release.json`);
    return manifest;
  } finally { client.destroy(); }
}
export async function webFiles(directory){
 const files=[];
 async function walk(path=''){
  for(const entry of await readdir(resolve(directory,path),{withFileTypes:true})){
   if(entry.name.startsWith('.'))continue;
   const name=path?path+'/'+entry.name:entry.name;
   if(entry.isDirectory())await walk(name);
   else if(entry.isFile())files.push(name);
   else throw new Error('Build assets must be regular files');
  }
 }
 await walk();return files.sort();
}
export async function webDigest(directory){
 const hash=createHash('sha256');
 for(const name of await webFiles(directory))hash.update(name+'\0').update(await readFile(resolve(directory,name)));
 return hash.digest('hex');
}
export async function publishWeb(client,bucket,commit,version,root,log=()=>{}){
 const directory=resolve(root,'apps/web/dist');
 const metadata=JSON.parse(await readFile(resolve(directory,'__deployment.json'),'utf8'));
 if(metadata.commit!==commit||metadata.publicAssetVersion!==version||metadata.assetMode!=='r2')throw new Error('Web build does not match source and R2 mode');
 const prefix=`web/${metadata.buildId}`;
 const files=await webFiles(directory);
 const digest=await webDigest(directory);
 let reused=false;
 try {
  const previous=await client.send(new HeadObjectCommand({Bucket:bucket,Key:`${prefix}/__release.json`}));
  if(previous.Metadata?.['build-digest']!==digest)throw new Error('Refusing to overwrite an immutable web build');
  reused=true;
 } catch(error){if(error.$metadata?.httpStatusCode!==404)throw error;}
 if(!reused){
  for(const name of files){
   const compressed=name.endsWith('.json.gz');
   await client.send(new PutObjectCommand({Bucket:bucket,Key:`${prefix}/${name}`,Body:await readFile(resolve(directory,name)),ContentType:compressed?'application/json':contentType(name),...(compressed?{ContentEncoding:'gzip'}:{}),CacheControl:'public, max-age=31536000, immutable'}));
  }
 }
 const release={...metadata,files:files.length,digest};
 if(!reused)await client.send(new PutObjectCommand({Bucket:bucket,Key:`${prefix}/__release.json`,Body:JSON.stringify(release),ContentType:'application/json',CacheControl:'no-store',Metadata:{'build-digest':digest}}));
 await writeFile(resolve(directory,'.r2-upload.json'),JSON.stringify(release));
 log(`${reused?'Web reused':'Web ready'}: ${prefix}; ${files.length} files`);
 return {...release,reused};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const index=process.argv.indexOf('--source');
  publishAssets({upload:process.argv.includes('--upload'),source:index<0?'HEAD':process.argv[index+1]}).catch(error=>{console.error(`${error.name}: ${error.message}`);process.exitCode=1;});
}
