import {createHash} from 'node:crypto';
import type {Store,Transaction,ReadView} from '../../persistence/src/store.ts';
import {DomainError,requireThat,type Character,type Rules} from './model.ts';
import {owned,bump} from './context.ts';
import {items,nameOf,icon} from './rules/catalog.js';
import {receive,put,tradable} from './rules/inventory.js';
import {bagCapacity} from './rules/character.js';
import {nextItemIdentity} from './rules/item-identity.js';

export type MailAttachment={kind:'catalog'|'instance';id:number;count:number;name:string;icon:string|null;item?:Rules};
export type MailRow={id:string;accountId:string;recipientId:string|null;senderId:string|null;senderName:string;subject:string;body:string;copper:number;attachments:MailAttachment[];status:'pending'|'claimed';createdAt:number;claimedAt?:number;claimedBy?:string;claimRequestId?:string};

export const mailId=(accountId:string,requestId:string)=>'mail:'+createHash('sha256').update(JSON.stringify([accountId,requestId])).digest('hex');
export function validateMailDraft(action:Rules){
  requireThat(typeof action.subject==='string'&&action.subject.trim().length>0&&action.subject.length<=80&&typeof action.body==='string'&&action.body.length<=1000,
    'MAIL_CONTENT','邮件主题或正文无效',400);
  requireThat(Number.isSafeInteger(action.copper)&&action.copper>=0&&Array.isArray(action.items)&&action.items.length<=12&&
    action.items.every((item:Rules)=>item&&typeof item.uid==='string'&&Number.isSafeInteger(item.count)&&item.count>0),
    'MAIL_CONTENT','邮件附件无效',400);
}
export async function mailInbox(store:Store,accountId:string,actorId?:string){return store.read(async tx=>{
  requireThat(await tx.get('accounts',accountId),'NOT_FOUND','存档不存在',404);
  if(actorId)await owned(tx,accountId,actorId);
  return (await tx.list<MailRow>('mail',{accountId,status:'pending'})).filter(row=>!row.recipientId||row.recipientId===actorId).sort((a,b)=>b.createdAt-a.createdAt);
});}
export async function resolveMailRecipientInView(tx:ReadView,recipient:string,senderId:string){
  requireThat(typeof recipient==='string'&&recipient.trim().length>0&&recipient.trim().length<=40,'MAIL_RECIPIENT','请输入收件人角色名',400);
  const matches=(await tx.list<Character>('characters')).filter(c=>c.kind==='hero'&&(c.rules.name===recipient.trim()||c.id===recipient.trim()));
  requireThat(matches.length===1,'MAIL_RECIPIENT',matches.length?'角色名不唯一，请使用角色 ID':'找不到收件人角色',404);
  requireThat(matches[0].id!==senderId,'MAIL_RECIPIENT','不能给自己寄邮件',400);
  return {id:matches[0].id,accountId:matches[0].accountId,name:matches[0].rules.name};
}
export function resolveMailRecipient(store:Store,recipient:string,senderId:string){return store.read(tx=>resolveMailRecipientInView(tx,recipient,senderId));}
export async function mailForClaim(store:Store,accountId:string,actorId:string,id:string,requestId:string){return store.read(async tx=>{
  const row=await tx.get<MailRow>('mail',id);
  requireThat(row?.accountId===accountId&&(!row.recipientId||row.recipientId===actorId)&&
    (row.status==='pending'||row.status==='claimed'&&row.claimRequestId===requestId&&row.claimedBy===actorId),
    'MAIL_NOT_FOUND','邮件不存在或已领取',404);
  return {copper:row.copper,attachments:row.attachments};
});}
export async function claimMail(tx:Transaction,c:Character,state:Rules,id:unknown,now:number){
  requireThat(typeof id==='string'&&id.length<=300,'MAIL_ID','邮件编号无效',400);
  const mail=await tx.get<MailRow>('mail',id);
  requireThat(mail?.accountId===c.accountId&&(!mail.recipientId||mail.recipientId===c.id),'NOT_FOUND','邮件不存在',404);
  if(mail.status==='claimed')return state;
  requireThat(mail.status==='pending','MAIL_STATUS','邮件不可领取');
  const next=structuredClone(state);applyMailClaim(next,mail);
  await tx.put('mail',{...mail,status:'claimed',claimedAt:now,claimedBy:c.id});
  return next;
}
export function applyMailClaim(actor:Rules,mail:{copper:number;attachments:MailAttachment[]}){
  requireThat(mail&&Array.isArray(mail.attachments)&&Number.isSafeInteger(mail.copper)&&mail.copper>=0,'MAIL_CONTENT','邮件附件无效',400);
  try{for(const attachment of mail.attachments){
    if(attachment.kind==='catalog')receive(actor,attachment.id,attachment.count);
    else{
      requireThat(attachment.item&&attachment.item.id===attachment.id&&attachment.item.count===attachment.count,'MAIL_CONTENT','邮件物品无效',400);
      const definition=items[attachment.id];
      if(definition?.maxcount>0){
        const held=[...actor.bag,...actor.bank,...actor.pending,...Object.values(actor.equipment)].filter((i:Rules)=>i.id===attachment.id).reduce((n:number,i:Rules)=>n+i.count,0);
        requireThat(held+attachment.count<=definition.maxcount,'MAIL_UNIQUE','超过唯一物品持有上限',400);
      }
      put(actor.bag,{...structuredClone(attachment.item),uid:nextItemIdentity(actor)},bagCapacity(actor));
    }
  }}catch(error){const message=(error as Error).message;throw new DomainError('MAIL_BAG',message.includes('空间不足')?'背包空间不足，请先清理背包再领取，邮件已为你保留。':message,400);}
  requireThat(Number.isSafeInteger(actor.money+mail.copper),'MAIL_BALANCE','金币已达上限，邮件暂未领取',400);
  actor.money+=mail.copper;
}
export function applyMailSend(actor:Rules,itemsToSend:{uid:string;count:number}[],copper:number){
  requireThat(Number.isSafeInteger(copper)&&copper>=0&&copper<=actor.money,'MAIL_MONEY','邮寄金币无效或余额不足',400);
  requireThat(Array.isArray(itemsToSend)&&itemsToSend.length<=12&&new Set(itemsToSend.map(i=>i.uid)).size===itemsToSend.length,'MAIL_ITEMS','最多邮寄 12 组不同物品',400);
  for(const selected of itemsToSend){
    requireThat(typeof selected.uid==='string'&&Number.isSafeInteger(selected.count)&&selected.count>0,'MAIL_ITEMS','物品数量无效',400);
    const item=actor.bag.find((i:Rules)=>i.uid===selected.uid);
    requireThat(item&&tradable(item)&&item.count>=selected.count,'MAIL_ITEMS','物品不存在、数量不足或无法邮寄',400);
    item.count-=selected.count;if(!item.count)actor.bag.splice(actor.bag.indexOf(item),1);
  }
  actor.money-=copper;
}
export async function commitMailSend(tx:Transaction,row:{accountId:string;input:{actorId:string;requestId:string;command:Rules}},sender:Character,now:number){
  const command=row.input.command,id=mailId(row.accountId,row.input.requestId);
  if(await tx.get('mail',id))return;
  const recipient=await tx.get<Character>('characters',command.recipientId);
  requireThat(recipient?.kind==='hero'&&recipient.accountId===command.recipientAccountId,'MAIL_RECIPIENT','收件人角色已不存在',404);
  const attachments:MailAttachment[]=[];
  for(const selected of command.items){
    const item=await tx.get('items',selected.uid);
    requireThat(item?.ownerCharacterId===sender.id&&item.container==='bag'&&item.data.count>=selected.count&&tradable(item.data),'MAIL_ITEMS','邮寄物品已变化',409);
    attachments.push({kind:'instance',id:item.data.id,count:selected.count,name:nameOf('items',item.data.id),icon:icon('items',item.data.id),item:{...item.data,count:selected.count}});
  }
  await tx.insert('mail',{id,accountId:recipient.accountId,recipientId:recipient.id,senderId:sender.id,senderName:sender.rules.name,
    subject:command.subject,body:command.body,copper:command.copper,attachments,status:'pending',createdAt:now} satisfies MailRow);
  await bump(tx,recipient.accountId);
}
