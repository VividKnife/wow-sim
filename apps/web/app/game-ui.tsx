"use client";
import {Button} from '@/components/ui/button';
import './item-details.css';
export const money=(c:number)=>`${Math.floor(c/10000)?Math.floor(c/10000)+' 金 ':''}${Math.floor(c%10000/100)?Math.floor(c%10000/100)+' 银 ':''}${c%100} 铜`;
export const duration=(ms:number)=>{const seconds=Math.max(0,Math.ceil(ms/1000));return seconds>=60?`${Math.floor(seconds/60)}分${seconds%60}秒`:`${seconds}秒`};
export function Icon({src,name,size=40}:{src?:string|null;name:string;size?:number}){return src?<img src={src} alt="" title={name} width={size} height={size} className="game-icon"/>:<span className="game-icon missing-icon" style={{width:size,height:size}} title={`${name} · 图标待收录`}>{name.slice(0,1)}</span>}
export function Bar({value,max,label,tone='health'}:{value:number;max:number;label:string;tone?:string}){return <div className={'resource '+tone} aria-label={`${label} ${Math.ceil(value)} / ${max}`}><div style={{width:Math.min(100,Math.max(0,value/max*100))+'%'}}/><span>{label} <b>{Math.ceil(value)} / {max}</b></span></div>}
const itemStatNames:Record<number,string>={0:'法力',1:'生命',3:'敏捷',4:'力量',5:'智力',6:'精神',7:'耐力'};
const equipmentSlots:Record<number,string>={1:'头部',2:'颈部',3:'肩部',4:'衬衣',5:'胸部',6:'腰部',7:'腿部',8:'脚',9:'手腕',10:'手',11:'手指',12:'饰品',13:'单手',14:'副手',15:'远程',16:'背部',17:'双手',20:'胸部',21:'主手',22:'副手',23:'副手物品',25:'投掷',26:'远程'};
const armorTypes:Record<number,string>={1:'布甲',2:'皮甲',3:'锁甲',4:'板甲',6:'盾牌'};
const weaponTypes:Record<number,string>={0:'斧',1:'斧',2:'弓',3:'枪械',4:'锤',5:'锤',6:'长柄武器',7:'剑',8:'剑',10:'法杖',13:'拳套',15:'匕首',16:'投掷武器',18:'弩',19:'魔杖',20:'鱼竿'};
export function ItemTooltip({item,instance,auction=false}:{item:any;instance?:any;auction?:boolean}){
 if(!item)return null;
 return <div className="classic-item-tooltip" aria-label={`${item.name} · 装备详情`}>
  <strong className={`classic-item-name quality-${item.quality}`}>{item.name}</strong>
  {item.binding&&<div>{item.binding}</div>}{item.unique>0&&<div>唯一{item.unique>1?` (${item.unique})`:''}</div>}
  <div className="classic-item-pair"><span>{equipmentSlots[item.slot]||''}</span><span>{item.class===4?armorTypes[item.subclass]:item.class===2?weaponTypes[item.subclass]:''}</span></div>
  {item.damage&&<div className="classic-item-pair"><span>{item.damage.join(' - ')} 伤害</span><span>速度 {(item.speed/1000).toFixed(2)}</span></div>}
  {item.dps>0&&<div>（每秒伤害 {item.dps}）</div>}{item.armor>0&&<div>{item.armor} 点护甲</div>}{item.block>0&&<div>{item.block} 格挡</div>}
  {(item.stats||[]).map((stat:any,index:number)=><div key={index}>{stat.value>0?'+':''}{stat.value} {itemStatNames[stat.type]||'属性'}</div>)}
  {item.resistances?.map((r:any)=><div key={r.name}>+{r.value} {r.name}抗性</div>)}
  {item.maxDurability>0&&<div>耐久度 {instance?.durability??item.maxDurability} / {item.maxDurability}</div>}
  {(auction||item.allowedClasses?.length>0)&&<div>职业：{item.allowedClasses?.length?item.allowedClasses.join('、'):'无专属职业限制'}</div>}
  {item.allowedRaces?.length>0&&<div>种族：{item.allowedRaces.join('、')}</div>}
  {item.level>0&&<div>需要等级 {item.level}</div>}{item.requiredSkill&&<div>需要{item.requiredSkill.name}（{item.requiredSkill.rank}）</div>}
  {item.itemLevel>0&&<div className="classic-item-muted">物品等级 {item.itemLevel}</div>}
  {item.effects?.map((effect:any,index:number)=><div className="item-effect" key={`${effect.id}:${index}`}>{effect.trigger}：{effect.text}{effect.cooldown>0?`（${duration(effect.cooldown)}冷却）`:''}{effect.charges>0?` · ${effect.charges} 次`:''}</div>)}
  {item.description&&<div className="item-effect">{item.description}</div>}
  {item.set&&<div className="classic-item-set"><strong>{item.set.name}（{item.set.pieces.length} 件）</strong><div className="classic-item-set-pieces">{item.set.pieces.map((piece:any)=><div key={piece.id} className={piece.id===item.id?'classic-item-set-current':'classic-item-muted'}>{piece.name}</div>)}</div>{item.set.bonuses.map((bonus:any)=><div className="classic-item-muted" key={bonus.spellId}>({bonus.count}) 套装：{bonus.text}</div>)}</div>}
  {item.flavor&&<div className="item-flavor">“{item.flavor}”</div>}
  {item.sell>0&&<div className="classic-item-sell">出售价格：{money(item.sell)}</div>}
 </div>;
}
export function Item({item,instance,onEquip,onSell}:{item:any;instance?:any;onEquip?:()=>void;onSell?:()=>void}){
 if(!item)return null;
 return <div className={'item-row quality-'+item.quality}><Icon src={item.icon} name={item.name}/><div className="grow"><strong>{item.name}</strong>{instance?.count>1&&<span> ×{instance.count}</span>}<small>{item.level>0?`需要等级 ${item.level} · `:''}{item.armor?`${item.armor} 护甲 · `:''}{item.damage?`${item.damage.join('—')} 伤害 · ${item.speed/1000}秒`:''}{(item.stats||[]).map((s:any)=>` ${s.value>0?'+':''}${s.value}${itemStatNames[s.type]||'属性'}`).join('')}</small>
  {(item.itemLevel||item.effects?.length>0)&&<details className="item-details"><summary>装备详情</summary><ItemTooltip item={item} instance={instance}/></details>}
 </div>{onEquip&&item.slot>0&&<Button variant="outline" size="sm" onClick={onEquip}>装备</Button>}{onSell&&item.sell>0&&<Button variant="ghost" size="sm" onClick={onSell}>卖出</Button>}</div>;
}
export type GameProps={roster?:readonly any[];state:any;data:any;busy:boolean;revision?:number;playback?:any;contentVersion?:string;simulationStatus?:string;send:(body:any)=>Promise<boolean>};
