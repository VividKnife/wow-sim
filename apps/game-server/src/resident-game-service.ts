import {SocialService} from '../../../packages/game-domain/src/social.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {account} from '../../../packages/game-domain/src/context.ts';
import {DomainError,requireThat,type Character,type Rules} from '../../../packages/game-domain/src/model.ts';
import {validateRuleAction} from '../../../packages/protocol/src/rule-action.ts';
import {SimulationClient} from './simulation-client.ts';
import type {GameSnapshot} from './server.ts';
import type {ClientRosterMember} from '../../../packages/contracts/src/game.ts';
import {bagCapacity} from '../../../packages/game-domain/src/rules/character.js';
import {talentSummary} from '../../../packages/game-domain/src/rules/talent-summary.js';

/** Account creation stays in the business service. Every gameplay mutation is
 * an owner intention; no failure path executes it in this gateway. */
export class ResidentGameService {
  private readonly accounts:GameService;
  private readonly social:SocialService;
  private readonly simulation:SimulationClient;
  private readonly routes=new Map<string,Promise<{instanceId:string;ownerEpoch:number}>>();
  private readonly metadata=new Map<string,{until:number;account:Rules;characters:ClientRosterMember[]}>();
  constructor(accounts:GameService,simulation:SimulationClient){this.accounts=accounts;this.simulation=simulation;this.social=new SocialService(accounts.store);}
  socialSnapshot=(accountId:string,actorId:string,query?:string)=>this.social.snapshot(accountId,actorId,query);
  socialCommand=(accountId:string,actorId:string,body:Rules)=>this.social.command(accountId,actorId,body);
  listSaves=(userId:string)=>this.accounts.listSaves(userId);
  resolveSave=(userId:string,saveId:string|null)=>this.accounts.resolveSave(userId,saveId);
  createSave=(userId:string,input:Parameters<GameService['createSave']>[1],requestId:string)=>this.accounts.createSave(userId,input,requestId);
  async deleteSave(userId:string,saveId:string){
    await this.simulation.deleteSave(userId,saveId);
    this.metadata.delete(saveId);
    for(const key of this.routes.keys())if(JSON.parse(key)[0]===saveId)this.routes.delete(key);
  }
  gmInbox=(accountId:string)=>this.accounts.gmInbox(accountId);
  async createAccount(accountId:string,input:Parameters<GameService['createAccount']>[1],requestId:string){
    await this.accounts.createAccount(accountId,input,requestId);this.metadata.delete(accountId);return this.snapshot(accountId);
  }
  private async identity(accountId:string,characterId?:string){
    let metadata=this.metadata.get(accountId);
    if(!metadata||metadata.until<Date.now()){
      metadata=await this.accounts.store.read(async tx=>{
        const owner=await account(tx,accountId),records=await tx.list<Character>('characters',{accountId}),items=await tx.list('items',{accountId});
        const characters=records.map(c=>({id:c.id,characterId:c.id,name:c.rules.name,classId:c.rules.classId,raceId:c.rules.raceId,level:c.rules.level,
          kind:c.kind,talentSummary:talentSummary(c.rules),professions:c.rules.professions,
          bagUsed:items.filter(i=>i.ownerCharacterId===c.id&&i.container==='bag').length,
          bagCapacity:bagCapacity({bags:items.filter(i=>i.ownerCharacterId===c.id&&i.container==='bags').map(i=>i.data)}),location:c.rules.location}));
        return {until:Date.now()+5000,account:owner,characters};
      });
      if(this.metadata.size>=256)this.metadata.delete(this.metadata.keys().next().value!);
      this.metadata.set(accountId,metadata);
    }
    const actorId=characterId??metadata.account.primaryCharacterId;
    requireThat(metadata.characters.some(c=>c.id===actorId),'FORBIDDEN','角色不属于此账号',403);
    return {...metadata,actorId};
  }
  private async route(accountId:string,actorId:string){
    const key=JSON.stringify([accountId,actorId]);let route=this.routes.get(key);
    if(!route){
      if(this.routes.size>=256)this.routes.delete(this.routes.keys().next().value!);
      route=this.simulation.openCharacter(accountId,actorId).catch(error=>{this.routes.delete(key);throw error;});this.routes.set(key,route);
    }
    return route;
  }
  async snapshot(accountId:string,characterId?:string,online=false,scope:'full'|'combat'='full'):Promise<GameSnapshot>{
    const metadata=await this.identity(accountId,characterId),actorId=metadata.actorId;
    try{
      const route=await this.route(accountId,actorId);
      const presentation=await this.simulation.presentation(route.instanceId,accountId,actorId,scope,online);
      const response={...presentation,account:{id:metadata.account.id,primaryCharacterId:metadata.account.primaryCharacterId,partyId:metadata.account.partyId,revision:presentation.revision},
        roster:metadata.characters.map(c=>c.id!==actorId?c:{...c,level:Number(presentation.snapshot?.player.level),
          location:String(presentation.snapshot?.player.location),bagUsed:(presentation.snapshot?.player.bag as unknown[]).length,
          bagCapacity:Number(presentation.snapshot?.view.bagCapacity??c.bagCapacity)}),
        activities:[],instanceId:null,instance:null};
      return {state:null,response,revision:response.revision,account:response.account,roster:response.roster,activities:[],instanceId:null,instance:null};
    }catch(error){
      this.routes.delete(JSON.stringify([accountId,actorId]));
      if(error instanceof DomainError)throw error;
      throw new DomainError('SIMULATION_UNAVAILABLE','模拟服务暂时不可用，正在恢复执行权',503);
    }
  }
  async command(accountId:string,submitted:Rules):Promise<GameSnapshot>{
    const {characterId,requestId,execution,...submittedAction}=submitted;
    let action=submittedAction;
    this.accounts.request(requestId);
    try{validateRuleAction(action as {type:string});}catch{throw new DomainError('INVALID_COMMAND','操作参数无效或该操作尚未接通服务器实例',400);}
    const {actorId}=await this.identity(accountId,characterId),route=await this.route(accountId,actorId);
    if(action.type==='npcMatchSupply')action={type:'npcMatchSupply',...await this.social.supply(accountId,actorId,action.dungeonId)};
    requireThat(execution&&typeof execution.instanceId==='string'&&Number.isSafeInteger(execution.clientSequence)&&execution.clientSequence>0&&
      Number.isSafeInteger(execution.controllerGeneration)&&execution.controllerGeneration>0,'COMMAND_OWNER','操作缺少有效执行权信息',409);
    if(action.type==='enterDungeon'&&(await this.social.snapshot(accountId,actorId)).group?.status==='matched'){
      const entered=await this.simulation.enterDungeon(accountId,{instanceId:execution.instanceId,actorId,controllerGeneration:execution.controllerGeneration,
        clientSequence:execution.clientSequence,requestId,command:{kind:'action',action:action as {type:string}}});
      this.routes.clear();
      const snapshot=await this.snapshot(accountId,actorId);
      return {...snapshot,response:{...snapshot.response!,commandReceipt:entered.receipt}};
    }
    requireThat(execution.instanceId===route.instanceId,'COMMAND_OWNER','角色执行权已改变，请刷新后重试',409);
    const receipt=await this.simulation.input(accountId,{instanceId:route.instanceId,actorId,controllerGeneration:execution.controllerGeneration,
      clientSequence:execution.clientSequence,requestId,command:{kind:'action',action:action as {type:string}}});
    requireThat(receipt.status!=='rejected','COMMAND_REJECTED',receipt.reason??'操作未完成',409);
    const snapshot=await this.snapshot(accountId,actorId);
    return {...snapshot,response:{...snapshot.response!,commandReceipt:receipt}};
  }
  async work(){return {advanced:0};}
}
