"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {MAX_STRATEGY_PROFILES,MAX_STRATEGY_PROFILE_NAME} from '../../../packages/sim-core/src/strategy-config.js';

type Config={rules:any[];policy:any;autoBuffs:any;potions:any};
type Profile=Config&{name:string;totalRules:number;unavailableRules:number};
export function StrategyProfiles({memberId,profiles,config,busy,send,onLoad}:{memberId:string;profiles:Profile[];config:Config;busy:boolean;send:(command:any)=>Promise<boolean>;onLoad:(config:Config)=>void}){
 const [name,setName]=useState(''),[selectedName,setSelectedName]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState(false);
 const selected=profiles.find(p=>p.name===selectedName),locked=busy||pending;
 const duplicate=profiles.some(p=>p.name.toLowerCase()===name.trim().toLowerCase());
 const run=async(operation:'saveProfile'|'loadProfile'|'deleteProfile',overwrite=false)=>{
  const targetName=operation==='saveProfile'&&!overwrite?name.trim():selected?.name;
  if(!targetName||locked)return;
  setPending(true);setNotice('');
  try{
   const ok=await send({type:'strategy',target:memberId,operation,name:targetName,...(operation==='saveProfile'?{...config,overwrite}:{})});
   if(!ok)return;
   if(operation==='loadProfile'&&selected){onLoad(structuredClone(selected));setNotice(`已读取并应用「${targetName}」${selected.unavailableRules?`，跳过 ${selected.unavailableRules} 条未学技能规则`:''}`);}
   else if(operation==='deleteProfile'){setSelectedName('');setNotice(`已删除「${targetName}」，当前生效策略不变`);}
   else {setSelectedName(targetName);setName('');setNotice(`已保存方案「${targetName}」，可随时读取`);}
  }finally{setPending(false);}
 };
 return <section className="strategy-profiles" aria-label="已保存的策略方案">
  <h3>我的策略方案 <small>{profiles.length} / {MAX_STRATEGY_PROFILES}</small></h3>
  <p>按成员保存多套技能规则、战斗职责、自动增益和药水配置。另存与覆盖仅保存方案；「读取并应用」会替换当前编辑内容并立即生效。全队补给阈值单独设置。</p>
  <div className="strategy-profile-actions"><input aria-label="新策略方案名称" placeholder="例如：单体输出、群怪、保命" maxLength={MAX_STRATEGY_PROFILE_NAME} value={name} disabled={locked} onChange={e=>setName(e.target.value)}/><Button variant="outline" disabled={locked||!name.trim()||duplicate||profiles.length>=MAX_STRATEGY_PROFILES} onClick={()=>run('saveProfile')}>另存为方案</Button></div>
  {duplicate&&<p className="strategy-profile-hint">已有同名方案，请从下方选择后覆盖，或换一个名称。</p>}
  {profiles.length>0?<>
   <div className="strategy-profile-actions"><select aria-label="已保存策略方案" value={selected?.name||''} disabled={locked} onChange={e=>{setSelectedName(e.target.value);setNotice('');}}><option value="">选择已保存的方案</option>{profiles.map(p=><option key={p.name} value={p.name}>{p.name} · {p.totalRules} 条规则</option>)}</select><Button disabled={locked||!selected} onClick={()=>run('loadProfile')}>读取并应用</Button></div>
   {selected&&<p>{selected.rules.length} 条规则可用；自动匹配已学最高等级技能。{selected.unavailableRules>0&&`有 ${selected.unavailableRules} 条未学技能规则，读取时跳过，原方案仍保留。`}</p>}
   <div className="strategy-profile-actions"><Button variant="outline" disabled={locked||!selected} onClick={()=>run('saveProfile',true)}>用当前配置覆盖所选方案</Button><Button variant="ghost" disabled={locked||!selected} onClick={()=>run('deleteProfile')}>删除方案</Button></div>
  </>:<p>尚未保存方案。填写名称，将当前编辑的配置另存。</p>}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
