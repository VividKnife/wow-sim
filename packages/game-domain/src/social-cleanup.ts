import type {Transaction} from '../../persistence/src/store.ts';
export async function cancelSocialProposal(tx:Transaction,id:string){
  const proposal=await tx.get('social_proposals',id);if(!proposal)return;
  const original=new Set<string>();
  for(const groupId of proposal.groups){const group=await tx.get('social_groups',groupId);if(!group)continue;
    for(const m of group.members)original.add(m.id);
    group.status='forming';delete group.proposalId;await tx.put('social_groups',group);
  }
  for(const member of proposal.members)if(!original.has(member.id))await tx.delete('social_members',member.id);
  await tx.delete('social_proposals',id);
}
/** Used only inside explicit save deletion. Social groups can outlive a save,
 * but cannot retain its deleted human or NPC membership claims. */
export async function removeSocialCharacters(tx:Transaction,ids:Set<string>){
  if(!ids.size)return;
  for(const p of await tx.list('social_proposals'))if(p.members.some((m:{id:string})=>ids.has(m.id)))await cancelSocialProposal(tx,p.id);
  for(const group of await tx.list('social_groups')){
    if(!group.members.some((m:{id:string})=>ids.has(m.id)))continue;
    group.members=group.members.filter((m:{id:string})=>!ids.has(m.id));group.status='forming';group.dungeonId=null;delete group.entry;
    if(!group.members.some((m:{npc:boolean})=>!m.npc)){
      for(const m of group.members)await tx.delete('social_members',m.id);
      await tx.delete('social_groups',group.id);await tx.delete('social_channels',`party:${group.id}`);
    }else{if(ids.has(group.leaderId))group.leaderId=group.members.find((m:{npc:boolean})=>!m.npc).id;await tx.put('social_groups',group);}
  }
  for(const id of ids){await tx.delete('social_members',id);await tx.delete('social_people',id);}
  for(const link of await tx.list('social_links'))if(ids.has(link.from)||ids.has(link.to))await tx.delete('social_links',link.id);
}
