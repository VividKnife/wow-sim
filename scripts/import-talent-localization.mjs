import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {readFile,writeFile} from 'node:fs/promises';

const SOURCE_URL='https://i1.sinaimg.cn/gm/ol/wow/talent/talelist1120_070614.js';
const SOURCE_SHA256='d8186b836c16b5bce2c94cf13e61f6776da5ca450c7b8797801618cafedb2c00';
const DATA_URL=new URL('../packages/game-data/data/classes-reference.json',import.meta.url);
const OUTPUT_URL=new URL('../packages/game-data/data/talent-descriptions-zhCN.json',import.meta.url);
const CLASS_NAMES={1:'战士',2:'圣骑士',3:'猎人',4:'盗贼',5:'牧师',7:'萨满祭司',8:'法师',9:'术士',11:'德鲁伊'};
const TREE_NAMES={Fire:'火焰',Frost:'冰霜',Arcane:'奥术','野兽控制':'野兽掌握'};

function normalizedHtml(text){
  return text.replace(/<br\s*\/?>/gi,'\n').replace(/&nbsp;/gi,' ').replace(/Rank (\d+):/g,'等级 $1：').replace(/\r/g,'').trim();
}

async function loadSourceTalents(){
  const response=await fetch(SOURCE_URL);
  if(!response.ok)throw new Error(`talent localization source request failed: ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(digest!==SOURCE_SHA256)throw new Error(`talent localization source hash mismatch: ${digest}`);
  const source=new TextDecoder('gbk').decode(bytes);
  const sandbox={window:{},document:{},console,classLstCn:[],classLstEn:[],classLst:[],classId:{},typesId:[],types:[],talents:[],talentImages:[],classStr:null,chinese:true};
  vm.createContext(sandbox,{codeGeneration:{strings:false,wasm:false}});
  vm.runInContext(source,sandbox,{timeout:5000});
  sandbox.preDefineClass();
  const result=[];
  for(const className of sandbox.classLstCn){
    sandbox.currentClass=className;
    sandbox.loadType();
    sandbox.talents=[];
    sandbox.loadTalentsCn();
    for(const talent of sandbox.talents.filter(Boolean))result.push({className,...talent});
  }
  return result;
}

const reference=JSON.parse(await readFile(DATA_URL,'utf8'));
const sourceTalents=await loadSourceTalents();
const sourceByPosition=new Map(sourceTalents.map(t=>[`${t.className}:${t.Type}:${t.Tier-1}:${t.Column-1}`,t]));
const sourceByNameRank=new Map(sourceTalents.map(t=>[`${t.className}:${t.Name}:${t.Info.length}`,t]));
const descriptions={};
const mismatches=[];
for(const tree of reference.classTalentTrees){
  for(const talent of tree.talents){
    const className=CLASS_NAMES[tree.classId],treeName=TREE_NAMES[tree.nameZhCN||tree.name]||tree.nameZhCN||tree.name;
    const key=`${className}:${treeName}:${talent.row}:${talent.col}`;
    const localized=sourceByNameRank.get(`${className}:${talent.nameZhCN}:${talent.rankEffects.length}`)||sourceByPosition.get(key);
    if(!localized){mismatches.push(`${key} ${talent.nameZhCN}: missing`);continue;}
    if(localized.Info.length!==talent.rankEffects.length){mismatches.push(`${key} ${talent.nameZhCN}/${localized.Name}: rank count ${localized.Info.length} != ${talent.rankEffects.length}`);continue;}
    for(let index=0;index<talent.rankEffects.length;index++){
      const template=localized.Description||localized.Info[index].Description;
      const amounts=String(localized.Info[index].Amount||'').split(',');
      const description=normalizedHtml(template.replace(/\{(\d+)\}/g,(_,slot)=>amounts[Number(slot)]||'?'));
      descriptions[talent.rankEffects[index].spellId]=description;
    }
  }
}
if(mismatches.length)throw new Error(`talent localization coverage failed:\n${mismatches.join('\n')}`);

const output={
  source:{url:SOURCE_URL,sha256:SOURCE_SHA256,version:'WoW 1.12.0',revised:'2007-06-14'},
  descriptions,
};
if(process.argv.includes('--write')){
  await writeFile(OUTPUT_URL,JSON.stringify(output,null,2)+'\n','utf8');
  console.log(`wrote ${Object.keys(descriptions).length} localized talent rank descriptions`);
}else{
  console.log(`verified ${Object.keys(descriptions).length} localized talent rank descriptions`);
}
