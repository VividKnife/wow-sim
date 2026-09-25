import {MemoryStore} from '../../../../packages/persistence/src/memory.ts';
import {GameService} from '../../../../packages/game-domain/src/service.ts';
import {stats} from '../../../../packages/game-domain/src/rules/character.js';

export async function commandServiceFixture({now=()=>Number(1000),contentVersion='test'}={}){
 const store=new MemoryStore(),service=new GameService(store,{now,contentVersion,seed:()=>747});
 const save=await service.createSave('preview',{name:'指挥官',classId:8,raceId:1},'command');
 let sequence=0;
 const send=command=>service.command(save.id,{...command,requestId:`command-${++sequence}`});
 await store.transaction(async tx=>{const [hero]=await tx.list('characters',{accountId:save.id});hero.rules.level=20;hero.rules.completed[900001]=true;hero.rules.location='stormwind';await tx.put('characters',hero);});
 for(const [name,classId] of [['盾卫',1],['治疗',5],['斥候',4],['游侠',3]])await send({type:'createCompanion',name,classId,raceId:classId===3?3:1});
 const ids=await store.transaction(async tx=>{const chars=await tx.list('characters',{accountId:save.id});for(const c of chars){c.rules.level=20;c.rules.location='deadmines';delete c.rules.ammoRestockPrompt;if(c.rules.classId===3)c.rules.ammunition={2519:1000};c.rules.learned=[...new Set([...c.rules.learned,...({8:[118,116,122,2139],1:[71,355],5:[9484],4:[1784,6770,1766,408],3:[1499,5116]}[c.rules.classId]||[])])];c.rules.hp=stats(c.rules).maxHp;c.rules.mana=stats(c.rules).maxMana;await tx.put('characters',c);}return chars.map(c=>c.id);});
 await send({type:'setParty',characterIds:ids});
 await send({type:'combatCommand',order:'prepare',enabled:true});
 await send({type:'enterDungeon',contentId:'deadmines',characterIds:ids});
 const started=await send({type:'dungeonNext'});
 return {store,service,save,send,started};
}
