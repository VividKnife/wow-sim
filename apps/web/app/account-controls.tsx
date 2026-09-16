"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {classOptions,racesForClass} from './class-options.js';
import type {GameResponse} from '../../../packages/contracts/src/game';

type Props={game:GameResponse;busy:boolean;send:(body:any)=>Promise<boolean>};
export default function AccountControls({game,busy,send}:Props){
 const [name,setName]=useState('伙伴'),[classId,setClassId]=useState(1),[raceId,setRaceId]=useState(1);
 const [invitation,setInvitation]=useState(''),[capacity,setCapacity]=useState(5),[contentId,setContentId]=useState('northshire-skirmish');
 const [selected,setSelected]=useState<string[]>([]);
 const player=game.snapshot?.player,roster=(game.roster||[]) as any[],instance=game.instance as any;
 if(!player)return null;
 const races=racesForClass(classId),actorId=String(player.id);
 const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
 const members=[actorId,...selected.filter(id=>id!==actorId)];
 return <details className="panel account-controls"><summary>账号名册与共享副本</summary>
  <p>每名角色有独立背包、金币和专业。切换角色后可派遣采集或制造；后台订单会在关闭网页后继续执行。</p>
  <section><h3>创建长期伙伴</h3><div className="filterbar">
   <input aria-label="伙伴名称" value={name} maxLength={16} onChange={e=>setName(e.target.value)}/>
   <select aria-label="伙伴职业" value={classId} onChange={e=>{const id=Number(e.target.value);setClassId(id);setRaceId(racesForClass(id)[0].id);}}>{classOptions.map(row=><option value={row.id} key={row.id}>{row.name}</option>)}</select>
   <select aria-label="伙伴种族" value={raceId} onChange={e=>setRaceId(Number(e.target.value))}>{races.map(row=><option value={row.id} key={row.id}>{row.name}</option>)}</select>
   <Button disabled={busy||!name.trim()} onClick={()=>void send({type:'createCompanion',name,classId,raceId})}>创建伙伴</Button>
  </div></section>
  <section><h3>出战名册</h3><p>当前角色自动加入。正在外派或已经加入副本的角色不能同时执行其他活动。</p><div className="filterbar">
   {roster.filter(row=>row.id!==actorId).map(row=><label key={row.id}><input type="checkbox" disabled={busy} checked={selected.includes(row.id)} onChange={()=>toggle(row.id)}/>{row.name} · {row.level} 级</label>)}
   <Button variant="outline" disabled={busy||!!instance} onClick={()=>void send({type:'setParty',characterIds:members})}>更新出战队伍</Button>
  </div></section>
  <section><h3>共享实例</h3>{instance?<>
   <p>实例编号：<code>{String(instance.id)}</code></p><p>{instance.status==='forming'?'等待成员加入':instance.status==='completed'?'遭遇已完成':'正在进行'} · {instance.roster?.length||0} / {instance.capacity} 人</p>
   <div className="filterbar">{instance.status==='forming'&&<><Button disabled={busy} onClick={()=>void send({type:'startInstance',instanceId:instance.id})}>开始实例</Button>{[['warrior','战士'],['priest','牧师'],['mage','法师']].map(([id,label])=><Button key={id} variant="outline" disabled={busy} onClick={()=>void send({type:'hireMercenary',instanceId:instance.id,templateId:id})}>雇佣{label} · 1 银</Button>)}</>}
    <Button variant="outline" disabled={busy||!!player.combat} onClick={()=>void send({type:'leaveInstance',instanceId:instance.id})}>离开实例</Button></div>
  </>:<><div className="filterbar">
   <select aria-label="实例内容" value={contentId} onChange={e=>setContentId(e.target.value)}><option value="northshire-skirmish">北郡遭遇</option><option value="deadmines">死亡矿井</option></select>
   <select aria-label="实例席位" value={capacity} onChange={e=>setCapacity(Number(e.target.value))}>{[5,10,20,40].map(n=><option key={n} value={n}>{n} 人席位</option>)}</select>
   <Button disabled={busy||members.length>capacity} onClick={()=>void send({type:'createInstance',contentId,capacity,characterIds:members})}>创建实例</Button>
  </div><div className="filterbar"><input aria-label="邀请实例编号" placeholder="输入其他玩家的实例编号" value={invitation} onChange={e=>setInvitation(e.target.value)}/><Button variant="outline" disabled={busy||!invitation.trim()} onClick={()=>void send({type:'joinInstance',instanceId:invitation.trim(),characterIds:members})}>加入实例</Button></div>
  <small>死亡矿井需要在入口集合，五名成员均至少 10 级；更大席位用于当前通用遭遇。</small></>}</section>
 </details>;
}
