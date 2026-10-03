import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {GameProps,Icon} from './game-ui';

type Entry={key:string;enabled:boolean;target:number};
function SupplyEditor({state:s,data:d,busy,send}:GameProps){
 const [entries,setEntries]=useState<Entry[]>((s.townSupplies||[]).map((entry:Entry)=>({...entry}))),[choice,setChoice]=useState(''),[query,setQuery]=useState('');
 const options=d.townSupplies?.options||[],available=options.filter((option:any)=>!entries.some(entry=>entry.key===option.key)&&(!query||option.name.includes(query)||option.category.includes(query)));
 const valid=entries.every(entry=>Number.isInteger(entry.target)&&entry.target>=1&&entry.target<=10000);
 const disabled=busy||!!s.combat||!!s.dungeon||!['idle','hunt'].includes(s.activity.type);
 const update=(key:string,patch:Partial<Entry>)=>setEntries(rows=>rows.map(row=>row.key===key?{...row,...patch}:row));
 return <section className="panel town-supplies" aria-label="城镇自动购买"><h2>城镇自动购买</h2>
  <p>页面打开时，抵达城镇后按列表从当地商店补齐背包物品。猎人默认补给弹药；箭矢和子弹会选择当前等级可购买的最高档。按商店整组购买，余额或背包空间不足时停止。</p>
  {entries.map(entry=>{const option=options.find((option:any)=>option.key===entry.key),saved=d.townSupplies.entries.find((row:any)=>row.key===entry.key);return <div className="filterbar" key={entry.key}>
   {option?.icon&&<Icon src={option.icon} name={option.name} size={28}/>}
   <label><input disabled={disabled} type="checkbox" checked={entry.enabled} onChange={e=>update(entry.key,{enabled:e.target.checked})}/>{option?.name||entry.key}</label>
   <label>补齐至 <input disabled={disabled} aria-label={`${option?.name}补齐数量`} type="number" min={1} max={10000} step={1} value={entry.target} onChange={e=>update(entry.key,{target:Number(e.target.value)})}/></label>
   {saved&&<small>背包 {saved.current}{saved.itemId&&['arrows','bullets'].includes(entry.key)?` · ${d.items[saved.itemId]?.name||''}`:''}{!saved.available?' · 当地暂不可购买':''}</small>}
   <Button variant="outline" disabled={disabled} onClick={()=>setEntries(rows=>rows.filter(row=>row.key!==entry.key))}>移除</Button>
  </div>;})}
  <div className="filterbar">
   <input aria-label="搜索商店补给物品" placeholder="搜索食物、饮水、材料…" value={query} onChange={e=>setQuery(e.target.value)} disabled={disabled}/>
   <GameSelect aria-label="选择补给物品" value={choice} disabled={disabled} onValueChange={setChoice}><GameSelectOption value="">选择商店物品（按职业需求排序）</GameSelectOption>{available.map((option:any)=><GameSelectOption key={option.key} value={option.key}>{option.icon&&<Icon src={option.icon} name="" size={20}/>}<span>{option.name} · {option.category}{option.level>s.level?` · 需要 ${option.level} 级`:''}</span></GameSelectOption>)}</GameSelect>
   <Button variant="outline" disabled={disabled||!choice||entries.length>=32||entries.some(row=>row.key===choice)} onClick={()=>{setEntries(rows=>[...rows,{key:choice,enabled:true,target:['arrows','bullets'].includes(choice)?400:20}]);setChoice('');}}>添加补给</Button>
  </div>
  {!valid&&<p role="alert">补齐数量必须是 1—10000 的整数。</p>}
  <Button disabled={disabled||!valid} onClick={()=>void send({type:'townSupplySettings',entries})}>保存自动购买设置</Button>
  <p className="footnote">数量按物品个数计算；列表只包含商店商品。保存后在城镇会开始补给，城外则在下次回城时购买。补给中断后可再次保存以重试。</p>
 </section>;
}
export default function TownSupplyControls(props:GameProps){return <SupplyEditor key={`${props.state.id}:${JSON.stringify(props.state.townSupplies)}`} {...props}/>;}
