'use client';
import {Tooltip} from 'radix-ui';
import type {ReactElement} from 'react';
import {ItemTooltip,type GameProps} from './game-ui';
import './classic-action-tooltip.css';

type Props={action:ReturnType<typeof import('@/lib/classic-action-bar.js').quickActions>[number]|undefined;binding:string|null;data:GameProps['data'];state:GameProps['state'];shortcut?:string;children:ReactElement;disabled?:boolean};
const seconds=(ms:number)=>`${Number((ms/1000).toFixed(1))} 秒`;
const rankName=(rank:string)=>rank.replace(/^Rank\s*/,'等级 ').replace('Racial Passive','种族被动').replace('Racial','种族技能').replace('Passive','被动');

export default function ClassicActionTooltip({action,binding,data:d,state:s,shortcut,children,disabled}:Props){
 const [kind,rawId]=(binding||'').split(':'),id=Number(rawId);
 const spell=kind==='spell'?d.skills?.find((skill:GameProps['data'])=>skill.spellId===id):null;
 const item=kind==='item'?d.items?.[id]:null;
 const uid=action?.command&&'uid' in action.command?action.command.uid:undefined;
 const instance=item?s.bag?.find((entry:GameProps['state'])=>entry.uid===uid)||s.bag?.find((entry:GameProps['state'])=>entry.id===id):null;
 const racialDescription=spell?d.raceTraits?.find((trait:GameProps['data'])=>trait.id===id||trait.name===spell.name)?.description:undefined;
 const details=spell?.details,cost=spell?.powerCost??spell?.manaCost;
 const automatic=action&&'automatic' in action&&action.automatic;
 return <Tooltip.Root open={disabled?false:undefined}><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="cu-action-tooltip" side="top" align="start" sideOffset={10} collisionPadding={12}>
  {item?<ItemTooltip item={item} instance={instance}/>:<>
   <header><strong>{spell?.name||action?.name||(binding?'未找到技能':'空栏位')}</strong>{spell?.rank&&<small>{rankName(spell.rank)}</small>}</header>
   {spell&&<>
    <div className="cu-tooltip-facts"><span>{cost>0?`${cost} ${spell.powerName||'法力'}`:'无资源消耗'}</span><span>{spell.channelMs?`${seconds(spell.channelMs)} 引导`:spell.cast?`${seconds(spell.cast)}施法`:'瞬发'}</span></div>
    {details?.facts?.map((fact:string)=><div key={fact}>{fact}</div>)}
    {!!details?.effects?.length&&<div className="cu-tooltip-effects">{details.effects.map((effect:string)=><p key={effect}>{effect}</p>)}</div>}
    {racialDescription&&<p className="cu-tooltip-description">{racialDescription}</p>}
    {!!details?.restrictions?.length&&<div className="cu-tooltip-restrictions">{details.restrictions.map((restriction:string)=><p key={restriction}>{restriction}</p>)}</div>}
   </>}
  </>}
  {action?.description&&<p className="cu-tooltip-description">{action.description}</p>}
  {action&&action.remaining>0&&<p className="cu-tooltip-cooldown">冷却剩余：{seconds(action.remaining)}</p>}
  {automatic?<p className="cu-tooltip-note">由战斗策略自动释放</p>:action?.reason?<p className="cu-tooltip-error">{action.reason}</p>:binding&&!action?<p className="cu-tooltip-error">技能未学习或背包中已无此物品</p>:null}
  <footer>{shortcut&&<span>快捷键：{shortcut}</span>}<span>{shortcut?'右键配置栏位':binding?'点击放入所选栏位':'点击配置技能或物品'}</span></footer>
 </Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}
