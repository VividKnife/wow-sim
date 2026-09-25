import {characterPreview} from '../../../lib/character-preview.js';

export function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const raceId=Number(params.get('raceId')),classId=Number(params.get('classId')),level=params.get('level');
 if(!['1','20'].includes(level||''))return Response.json({error:'无效的起始等级'},{status:400});
 try{return Response.json(characterPreview(raceId,classId,level==='20'),{headers:{'Cache-Control':'public, max-age=300'}});}
 catch{return Response.json({error:'无效的种族与职业组合'},{status:400});}
}
