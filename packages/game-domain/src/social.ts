import {updateNpcPopulation} from './npc-population.ts';
import {NPC_LEVEL_RANGE,npcLevelFits,dungeonLevelsFit} from './rules/npc-match-policy.js';
import {cancelSocialProposal} from './social-cleanup.ts';
import {randomUUID} from 'node:crypto';
import type {Store,Transaction,ReadView,Row} from '../../persistence/src/store.ts';
import {owned} from './context.ts';
import {requireThat,type Rules} from './model.ts';
import {combatRole} from './rules/combat-roles.js';
import {dungeonDefinitions} from './rules/dungeon-registry.js';
import {currentEntry,entryRosterKey,fits,limits,supportedRoles,type Role,type Person,type Group} from './social-party.ts';

const npcRole=(row:Row):Role=>{const role=combatRole(row.rules);return role==='tank'||role==='healer'?role:'dps';};
function person(row:Row,npc=false):Person{return {id:row.id,name:row.rules.name,level:row.rules.level,classId:row.rules.classId,npc,role:npc?npcRole(row):null};}
const pair=(a:string,b:string)=>JSON.stringify([a,b].sort());
async function appendChat(tx:Transaction,id:string,message:Rules){const channel=await tx.get('social_channels',id)??{id,sequence:0,messages:[]};channel.sequence++;channel.messages=[...channel.messages,{...message,id:channel.sequence}].slice(-100);await tx.put('social_channels',channel);}
async function npcAvailable(tx:ReadView,npc:Row,rooms:Map<string,Rules>){
  if(npc.rules.hp!==undefined&&npc.rules.hp<=0)return false;
  return !await tx.get('simulation_characters',npc.id);
}
const online=(p:Row|null,now:number)=>!!p&&now-p.seenAt<45000;
const groupFor=async(tx:ReadView,id:string)=>{const claim=await tx.get('social_members',id);return claim?tx.get<Group>('social_groups',claim.groupId):null;};
const leader=(group:Group|null,id:string)=>{requireThat(group?.leaderId===id,'PARTY_LEADER','只有队长可以执行此操作',403);return group!;};
const editable=(group:Group)=>{requireThat(!group.instanceId,'PARTY_INSTANCE','请先离开副本再调整队伍',409);requireThat(!['queued','proposal'].includes(group.status),'PARTY_QUEUED','请先取消匹配再调整队伍',409);};
async function saveGroup(tx:Transaction,group:Group){if(group.entry&&!currentEntry(group))delete group.entry;await tx.put('social_groups',group);for(const member of group.members)await tx.put('social_members',{id:member.id,groupId:group.id});}
async function createGroup(tx:Transaction,self:Person,now:number){const group:Group={id:randomUUID(),leaderId:self.id,members:[self],status:'forming',dungeonId:null,queuedAt:0,updatedAt:now};await saveGroup(tx,group);return group;}
async function removeMember(tx:Transaction,group:Group,id:string,now:number){
  await tx.delete('social_members',id);group.members=group.members.filter(m=>m.id!==id);group.status='forming';group.dungeonId=null;group.updatedAt=now;
  if(!group.members.some(m=>!m.npc)){for(const member of group.members)await tx.delete('social_members',member.id);await tx.delete('social_groups',group.id);await tx.delete('social_channels',`party:${group.id}`);return;}
  if(group.leaderId===id)group.leaderId=group.members.find(m=>!m.npc)!.id;
  await saveGroup(tx,group);
}

/** Social membership does not transfer combat authority or modify character assets.
 * One serializable transaction owns invites, membership claims, queue and chat. */
export class SocialService {
  private readonly store:Store;
  private readonly now:()=>number;
  constructor(store:Store,now:()=>number=Date.now){this.store=store;this.now=now;}
  async supply(accountId:string,actorId:string,dungeonId?:string){
    return this.store.transaction(async tx=>{
      const self=person(await owned(tx,accountId,actorId)),group=await groupFor(tx,actorId);
      const leaderLevel=group?(await tx.get('characters',group.leaderId))!.rules.level:self.level;
      const levels=await Promise.all((group?.members??[self]).map(async m=>(await tx.get(m.npc?'npc_characters':'characters',m.id))?.rules.level??m.level)),reserved=await tx.list('social_members');
      const dungeon=dungeonId===undefined?null:Object.hasOwn(dungeonDefinitions,dungeonId)?dungeonDefinitions[dungeonId]:null;
      requireThat(dungeonId===undefined||dungeon,'DUNGEON','请选择已开放的地下城');
      requireThat(!dungeon||levels.every(l=>l>=dungeon.minimumLevel),'PARTY_LEVEL','成员需满足副本最低等级');
      await updateNpcPopulation(tx,this.now(),{level:leaderLevel,minimumLevel:Math.max(10,dungeon?.minimumLevel??10,leaderLevel-NPC_LEVEL_RANGE.below)});
      return {minimumLevel:Math.max(10,dungeon?.minimumLevel??10,leaderLevel-NPC_LEVEL_RANGE.below),maximumLevel:Math.min(60,leaderLevel+NPC_LEVEL_RANGE.above),
        unavailableIds:reserved.filter(r=>r.groupId!==group?.id).map(r=>r.id)};
    });
  }
  async snapshot(accountId:string,actorId:string,query=''){
    return this.store.transaction(async tx=>{
      const self=person(await owned(tx,accountId,actorId)),now=this.now();
      const previous=await tx.get('social_people',actorId);
      await tx.put('social_people',{...previous,id:actorId,seenAt:now});
      await updateNpcPopulation(tx,now);
      await this.match(tx,now);
      const group=await groupFor(tx,actorId),links=[...await tx.list('social_links',{from:actorId}),...await tx.list('social_links',{to:actorId})];
      if(group?.entry&&!currentEntry(group)){delete group.entry;await tx.put('social_groups',group);}
      for(const link of links)if(link.status==='pending'&&link.expiresAt<=now)await tx.delete('social_links',link.id);
      const friends=[];for(const link of links.filter(l=>l.kind==='friend'&&l.status==='accepted'&&l.people.includes(actorId))){
        const id=link.people.find((id:string)=>id!==actorId),row=await tx.get('characters',id)??await tx.get('npc_characters',id);
        if(row)friends.push({...person(row,row.realm==='public'),online:row.realm==='public'||online(await tx.get('social_people',id),now)});
      }
      const search=query.trim().slice(0,40),players=search?(await tx.list('characters')).filter(c=>c.kind==='hero'&&c.id!==actorId&&(c.id===search||c.rules.name.includes(search))).slice(0,20).map(c=>person(c)):[];
      const leaderLevel=group?(await tx.get('characters',group.leaderId))!.rules.level:self.level;
      const npcs=(await tx.list('npc_characters')).filter(n=>npcLevelFits(n.rules.level,leaderLevel)).map(n=>person(n,true));
      const incoming=links.filter(l=>l.to===actorId&&l.status==='pending'&&l.expiresAt>now).map(l=>({id:l.id,kind:l.kind,from:l.from,name:l.name,groupId:l.groupId}));
      const proposal=group?.proposalId?await tx.get('social_proposals',group.proposalId):null;
      const world=await tx.get('social_channels','world'),party=group?await tx.get('social_channels',`party:${group.id}`):null;
      return {self:{...self,roles:supportedRoles(self.classId)},friends,incoming,outgoing:links.filter(l=>l.from===actorId&&l.status==='pending'&&l.expiresAt>now).map(l=>({kind:l.kind,to:l.to})),players,npcs,group:group?{...group,entry:group.entry?{id:group.entry.id,dungeonId:group.entry.dungeonId,rosterKey:group.entry.rosterKey,requested:group.entry.requested}:undefined}:null,proposal,
        messages:{world:await Promise.all((world?.messages??[]).map(async(m:Rules)=>{if(m.kind!=='recruitment')return m;const current=await tx.get<Group>('social_groups',m.groupId);return {...m,open:current?.status==='queued'&&current.recruitmentId===m.recruitmentId,needed:Object.fromEntries(Object.entries(limits).map(([r,n])=>[r,Math.max(0,n-(current?.members.filter(p=>p.role===r).length??0))]))};})),party:party?.messages??[]},
        dungeons:Object.values(dungeonDefinitions).map(d=>({id:d.id,name:d.name,minimumLevel:d.minimumLevel,recommendedLevel:d.recommendedLevel,entrance:d.entrance})),
        policy:{npcLevelRange:NPC_LEVEL_RANGE,npcDelayMs:8000,autoTeleport:false}};
    });
  }
  async command(accountId:string,actorId:string,body:Rules){
    requireThat(typeof body.requestId==='string'&&/^[\w-]{8,100}$/.test(body.requestId),'SOCIAL_REQUEST','请求标识无效',400);
    await this.store.transaction(async tx=>{
      const self=person(await owned(tx,accountId,actorId)),now=this.now();
      const profile=await tx.get('social_people',actorId)??{id:actorId,seenAt:now,receipts:[]};
      const signature=JSON.stringify(Object.entries(body).filter(([k])=>k!=='requestId').sort(([a],[b])=>a.localeCompare(b)));
      const receipt=profile.receipts?.find((r:Row)=>r.id===body.requestId);
      if(receipt){requireThat(receipt.signature===signature,'SOCIAL_REQUEST','请求标识已被另一操作使用',409);return;}
      let group=await groupFor(tx,actorId);
      const targetId=body.targetId;
      if(['friendRequest','partyInvite','npcInvite'].includes(body.type)){
        requireThat(typeof targetId==='string'&&targetId.length<=200&&targetId!==actorId,'SOCIAL_TARGET','请选择其他角色',400);
        const npc=body.type==='npcInvite'||targetId.startsWith('npc:');
        const target=await tx.get(npc?'npc_characters':'characters',targetId);
        requireThat(target&&(npc||target.kind==='hero'),'SOCIAL_TARGET','找不到可邀请的角色',404);
        if(body.type==='friendRequest'){
          requireThat(([...await tx.list('social_links',{from:actorId}),...await tx.list('social_links',{to:actorId})]).filter(l=>l.kind==='friend'&&(l.status==='accepted'||l.expiresAt>now)).length<100,'FRIEND_LIMIT','好友及申请最多 100 位');
          const id=pair(actorId,targetId),existing=await tx.get('social_links',id);
          if(!existing||existing.status!=='accepted')await tx.put('social_links',{id,kind:'friend',people:[actorId,targetId],from:actorId,to:targetId,name:self.name,createdWall:now,status:npc?'accepted':'pending',expiresAt:now+7*86400000});
        }else{
          group??=await createGroup(tx,self,now);leader(group,actorId);editable(group);
          requireThat(group.members.length<5,'PARTY_FULL','小队已经满员');
          requireThat(!await groupFor(tx,targetId),'PARTY_JOINED','对方已经有队伍');
          if(npc){requireThat(await npcAvailable(tx,target!,new Map()),'NPC_BUSY','这位 NPC 正在副本或战斗中');requireThat(npcLevelFits(target!.rules.level,self.level),'PARTY_LEVEL','NPC 与队长等级差需在 -1～+3 级范围内');group.members.push(person(target!,true));group.status='forming';await saveGroup(tx,group);}
          else{const id=`invite:${targetId}`;const active=await tx.get('social_links',id);requireThat(!active||active.expiresAt<=now||active.groupId===group.id,'INVITE_PENDING','对方已有待处理的组队邀请');await tx.put('social_links',{id,kind:'party',from:actorId,to:targetId,name:self.name,groupId:group.id,status:'pending',expiresAt:now+60000});}
        }
      }else if(body.type==='respond'){
        const invite=await tx.get('social_links',body.inviteId);
        requireThat(invite&&invite.to===actorId&&invite.status==='pending'&&invite.expiresAt>now,'INVITE_EXPIRED','邀请已失效');
        if(body.accept===true){if(invite!.kind==='friend'){invite!.status='accepted';await tx.put('social_links',invite!);}else{
          requireThat(!group,'PARTY_JOINED','请先离开当前队伍');const invited=await tx.get<Group>('social_groups',invite!.groupId);
          requireThat(invited&&!invited.instanceId&&invited.leaderId===invite!.from&&!['queued','proposal'].includes(invited.status)&&invited.members.length<5,'INVITE_EXPIRED','队伍状态已经改变');invited!.members.push(self);invited!.status='forming';await saveGroup(tx,invited!);await tx.delete('social_links',invite!.id);
        }}else await tx.delete('social_links',invite!.id);
      }else if(body.type==='friendRemove'){
        requireThat(typeof targetId==='string','SOCIAL_TARGET','角色无效');await tx.delete('social_links',pair(actorId,targetId));
      }else if(body.type==='role'){
        requireThat(supportedRoles(self.classId).includes(body.role),'PARTY_ROLE','此职业不能承担该职责');
        group??=await createGroup(tx,self,now);editable(group);group.members.find(m=>m.id===actorId)!.role=body.role;group.status='forming';await saveGroup(tx,group);
      }else if(['leave','kick','promote'].includes(body.type)){
        requireThat(group,'PARTY_MISSING','当前没有队伍');
        requireThat(!group!.instanceId,'PARTY_INSTANCE','请先离开副本再调整队伍');
        if(body.type==='leave'){if(group!.proposalId){await cancelSocialProposal(tx,group!.proposalId);group=(await groupFor(tx,actorId))!;}await removeMember(tx,group!,actorId,now);}else{
          leader(group,actorId);editable(group!);requireThat(targetId!==actorId&&group!.members.some(m=>m.id===targetId),'SOCIAL_TARGET','成员无效');
          if(body.type==='kick')await removeMember(tx,group!,targetId,now);
          else{requireThat(!group!.members.find(m=>m.id===targetId)!.npc,'PARTY_LEADER','NPC 不能担任队长');group!.leaderId=targetId;await saveGroup(tx,group!);}
        }
      }else if(body.type==='queue'){
        group=leader(group,actorId);editable(group);const definition=Object.hasOwn(dungeonDefinitions,body.dungeonId)?dungeonDefinitions[body.dungeonId]:null;
        requireThat(definition,'DUNGEON','请选择已开放的地下城');
        // Refresh durable public level/class values; never trust submitted roster.
        for(const member of group.members){const row=await tx.get(member.npc?'npc_characters':'characters',member.id);requireThat(row,'PARTY_MEMBER','队伍成员已不存在');member.level=row!.rules.level;member.classId=row!.rules.classId;requireThat(member.role&&supportedRoles(member.classId).includes(member.role),'PARTY_ROLE','每名玩家需要先选择有效职责');if(member.npc)requireThat(await npcAvailable(tx,row!,new Map()),'NPC_BUSY','队伍中的 NPC 正在副本或战斗中');if(!member.npc)requireThat(member.id===actorId||online(await tx.get('social_people',member.id),now),'PARTY_OFFLINE','请等待所有玩家上线');}
        requireThat(fits(group.members),'PARTY_ROLE','需要 1 坦克、1 治疗、3 输出，请调整职责');
        requireThat(dungeonLevelsFit(group.members,group.leaderId,definition.minimumLevel),'PARTY_LEVEL','成员需满足副本最低等级，NPC 与队长等级差需在 -1～+3 级范围内');
        requireThat((await tx.list('social_groups',{status:'queued'})).length<256,'QUEUE_CAPACITY','查找器繁忙，请稍后再试',503);
        requireThat(profile.lastRecruitAt===undefined||now-profile.lastRecruitAt>=15000,'RECRUIT_RATE','请等待 15 秒再发布新的匹配招募',429);
        group.status='queued';group.dungeonId=body.dungeonId;group.queuedAt=now;group.updatedAt=now;group.recruitmentId=randomUUID();await saveGroup(tx,group);profile.lastRecruitAt=now;
        await appendChat(tx,'world',{kind:'recruitment',actorId,name:self.name,classId:self.classId,at:now,groupId:group.id,recruitmentId:group.recruitmentId,dungeonId:definition.id,
          minimumLevel:definition.minimumLevel,maximumLevel:60,
          text:`${self.name} 正在寻找 ${definition.name} 的队友`});
      }else if(body.type==='recruitJoin'){
        const destination=typeof body.groupId==='string'?await tx.get<Group>('social_groups',body.groupId):null;
        requireThat(destination&&destination.status==='queued'&&destination.recruitmentId===body.recruitmentId,'RECRUIT_CLOSED','招募已经结束，请选择新的队伍');
        requireThat(online(await tx.get('social_people',destination!.leaderId),now),'RECRUIT_CLOSED','队长已经离线');
        requireThat(!group||group.status==='forming'&&group.members.length===1,'PARTY_JOINED','请先离开当前队伍或取消匹配');
        requireThat(supportedRoles(self.classId).includes(body.role),'PARTY_ROLE','此职业不能承担该职责');self.role=body.role;
        const members=[...destination!.members,self];requireThat(fits(members),'PARTY_FULL','这个职责已满员');
        requireThat(dungeonLevelsFit(members,destination!.leaderId,dungeonDefinitions[destination!.dungeonId!].minimumLevel),'PARTY_LEVEL','等级不符合这条招募');
        if(group)await removeMember(tx,group,actorId,now);
        destination!.members=members;destination!.updatedAt=now;await saveGroup(tx,destination!);
      }else if(body.type==='proposal'){
        requireThat(group?.proposalId&&group.proposalId===body.proposalId,'PROPOSAL_EXPIRED','匹配确认已失效');
        const proposal=await tx.get('social_proposals',group!.proposalId!);
        requireThat(proposal&&proposal.expiresAt>now&&proposal.members.some((m:Person)=>m.id===actorId&&!m.npc),'PROPOSAL_EXPIRED','匹配确认已失效');
        if(body.accept!==true)await cancelSocialProposal(tx,proposal!.id);
        else{
          proposal!.accepted=[...new Set([...proposal!.accepted,actorId])];await tx.put('social_proposals',proposal!);
          if(proposal!.members.filter((m:Person)=>!m.npc).every((m:Person)=>proposal!.accepted.includes(m.id))){
            for(const member of proposal!.members){const row=await tx.get(member.npc?'npc_characters':'characters',member.id);requireThat(row&&(!member.npc||await npcAvailable(tx,row,new Map())),'PARTY_BUSY','匹配成员的状态已经改变，请重新匹配');member.level=row!.rules.level;}
            const destination=(await tx.get<Group>('social_groups',proposal!.groups[0]))!;
            requireThat(dungeonLevelsFit(proposal!.members,destination.leaderId,dungeonDefinitions[proposal!.dungeonId].minimumLevel),'PARTY_LEVEL','匹配成员等级已经改变，请重新匹配');
            destination.members=proposal!.members;destination.status='matched';destination.updatedAt=now;delete destination.proposalId;
            destination.entry={id:proposal!.id,dungeonId:proposal!.dungeonId,rosterKey:entryRosterKey(destination),requested:[]};await saveGroup(tx,destination);
            for(const id of proposal!.groups.slice(1)){await tx.delete('social_groups',id);await tx.delete('social_channels',`party:${id}`);}
            await tx.delete('social_proposals',proposal!.id);
          }
        }
      }else if(body.type==='cancel'){
        group=leader(group,actorId);requireThat(group.status==='queued','QUEUE_MISSING','当前未在匹配');group.status='forming';await saveGroup(tx,group);
      }else if(body.type==='chat'){
        requireThat(['world','party'].includes(body.channel),'CHAT_CHANNEL','频道无效');
        const text=typeof body.text==='string'?body.text.trim():'';
        requireThat(text.length>0&&text.length<=300&&!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text),'CHAT_TEXT','消息需要 1–300 个字符，不能包含控制字符');
        requireThat(profile.lastChatAt===undefined||now-profile.lastChatAt>=1000,'CHAT_RATE','发送太快，请稍后重试',429);
        if(body.channel==='party')requireThat(group,'PARTY_MISSING','加入队伍后才能使用队伍频道');
        await appendChat(tx,body.channel==='world'?'world':`party:${group!.id}`,{actorId,name:self.name,classId:self.classId,text,at:now});profile.lastChatAt=now;
      }else requireThat(false,'SOCIAL_COMMAND','未知社交操作',400);
      profile.seenAt=now;profile.receipts=[...(profile.receipts??[]),{id:body.requestId,signature}].slice(-64);await tx.put('social_people',profile);
      await this.match(tx,now);
    });
    return this.snapshot(accountId,actorId);
  }
  private async match(tx:Transaction,now:number){
    for(const proposal of await tx.list('social_proposals')){
      const rooms=new Map<string,Rules>();let valid=proposal.expiresAt>now;
      for(const member of proposal.members){const row=await tx.get(member.npc?'npc_characters':'characters',member.id);if(!row||member.npc&&!await npcAvailable(tx,row,rooms))valid=false;}
      const destination=await tx.get<Group>('social_groups',proposal.groups[0]);
      for(const member of proposal.members){const row=await tx.get(member.npc?'npc_characters':'characters',member.id);if(row)member.level=row.rules.level;}
      if(!valid||!destination||!dungeonLevelsFit(proposal.members,destination.leaderId,dungeonDefinitions[proposal.dungeonId].minimumLevel))await cancelSocialProposal(tx,proposal.id);
    }
    const queued=(await tx.list<Group>('social_groups',{status:'queued'})).sort((a,b)=>a.queuedAt-b.queuedAt||a.id.localeCompare(b.id));
    for(const group of queued){
      let valid=true;
      for(const member of group.members){const row=await tx.get(member.npc?'npc_characters':'characters',member.id);if(row)member.level=row.rules.level;else valid=false;}
      if(!valid||!dungeonLevelsFit(group.members,group.leaderId,dungeonDefinitions[group.dungeonId!].minimumLevel)){group.status='forming';await saveGroup(tx,group);}
    }
    const consumed=new Set<string>(),rooms=new Map<string,Rules>();
    for(const group of queued){
      if(group.status!=='queued'||consumed.has(group.id))continue;
      if(now-group.queuedAt>10*60000||!(await Promise.all(group.members.filter(m=>!m.npc).map(async m=>online(await tx.get('social_people',m.id),now)))).every(Boolean)){group.status='forming';await saveGroup(tx,group);consumed.add(group.id);continue;}
      const sources=[group];let members=[...group.members];
      for(const candidate of queued){if(candidate.status!=='queued'||candidate.id===group.id||consumed.has(candidate.id)||candidate.dungeonId!==group.dungeonId||now-candidate.queuedAt>10*60000)continue;
        const combined=[...members,...candidate.members];
        if(!fits(combined)||!dungeonLevelsFit(combined,group.leaderId,dungeonDefinitions[group.dungeonId!].minimumLevel)||!(await Promise.all(candidate.members.filter(m=>!m.npc).map(async m=>online(await tx.get('social_people',m.id),now)))).every(Boolean))continue;
        sources.push(candidate);members=combined;
      }
      if(members.length<5&&now-group.queuedAt>=8000){
        const candidates=(await tx.list('npc_characters')).sort((a,b)=>a.id.localeCompare(b.id));
        const available:Person[]=[];
        for(const row of candidates){
          const npc=person(row,true);
          if(members.some(m=>m.id===npc.id)||!dungeonLevelsFit([...members,npc],group.leaderId,dungeonDefinitions[group.dungeonId!].minimumLevel)||await tx.get('social_members',npc.id)||!await npcAvailable(tx,row,rooms))continue;
          available.push(npc);
        }
        const selected=[...members];
        for(const role of ['tank','healer','dps'] as Role[])for(const npc of available){
          if(npc.role===role&&selected.filter(m=>m.role===role).length<limits[role])selected.push(npc);
        }
        if(selected.length===5)members=selected;
      }
      if(members.length!==5)continue;
      const id=randomUUID();
      await tx.insert('social_proposals',{id,members,groups:sources.map(s=>s.id),dungeonId:group.dungeonId,expiresAt:now+40000,accepted:[]});
      for(const source of sources){consumed.add(source.id);source.status='proposal';source.proposalId=id;await saveGroup(tx,source);}
      for(const member of members)if(!await tx.get('social_members',member.id))await tx.put('social_members',{id:member.id,groupId:group.id});
    }
  }
}
