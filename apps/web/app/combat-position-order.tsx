import {useEffect,useState} from 'react';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';

const labels:Record<string,string>={queued:'等待执行',moving:'移动中',holding:'保持站位',blocked:'暂时受阻',cancelled:'已撤销',failed:'执行失败'};
export default function CombatPositionOrder({battle,view,memberId,locked,request}:{battle:any;view:any;memberId:string;locked:boolean;request:(order:string,extra?:any)=>void}){
 const [scope,setScope]=useState('member'),[x,setX]=useState(''),[y,setY]=useState('');
 const area=battle.area,members=view.members||[],member=members.find((m:any)=>m.id===memberId);
 useEffect(()=>{setScope('member');setX('');setY('');},[battle.id]);
 if(!area)return null;
 const selected=members.filter((m:any)=>scope==='all'||(scope==='squad'?member?.squad!=null&&m.squad===member.squad:m.id===memberId));
 const ids=selected.map((m:any)=>m.id),living=selected.filter((m:any)=>m.hp>0).map((m:any)=>m.id);
 const tasks=(battle.command?.movementTasks||[]).filter((t:any)=>ids.includes(t.memberId));
 const history=(battle.command?.movementResults||[]).filter((t:any)=>ids.includes(t.memberId)).slice(-3);
 const width=area.maxX-area.minX,height=area.maxY-area.minY;
 const valid=x!==''&&y!==''&&Number.isFinite(Number(x))&&Number.isFinite(Number(y));
 const locate=(px:number,py:number)=>{setX(Math.max(area.minX,Math.min(area.maxX,px)).toFixed(1));setY(Math.max(area.minY,Math.min(area.maxY,py)).toFixed(1));};
 return <details className="combat-spell-details"><summary>站位与集合</summary>
  <div className="command-position-form">
   <label>受令范围<GameSelect aria-label="站位受令范围" value={scope} onValueChange={setScope} disabled={locked}><GameSelectOption value="member">所选成员</GameSelectOption><GameSelectOption value="squad" disabled={member?.squad==null}>所选成员的小队</GameSelectOption><GameSelectOption value="all">全队存活成员</GameSelectOption></GameSelect></label>
   <p>点击场地图选择集合点，也可输入坐标。到位后原地战斗；危险区撤离优先，指定施法会接管站位任务。</p>
   <svg role="img" aria-label="站位场地图，点击选择地点，方向键调整坐标" tabIndex={locked?-1:0} viewBox={`${area.minX} ${area.minY} ${width} ${height}`} width="400" height={400*height/width} style={{height:'auto',width:'100%',maxWidth:400,background:'#161b23',border:'1px solid #64748b',touchAction:'manipulation'}} onClick={e=>{if(locked)return;const rect=e.currentTarget.getBoundingClientRect();locate(area.minX+(e.clientX-rect.left)/rect.width*width,area.minY+(e.clientY-rect.top)/rect.height*height);}} onKeyDown={e=>{if(locked||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();locate((valid?Number(x):(area.minX+area.maxX)/2)+(e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0),(valid?Number(y):(area.minY+area.maxY)/2)+(e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0));}}>
    {(area.obstacles||[]).map((o:any,i:number)=><circle key={i} cx={o.x} cy={o.y} r={o.radius} fill={o.blocksMovement===false?'#475569':'#927d60'}/>)}
    {members.filter((a:any)=>a.hp>0).map((a:any)=><circle key={a.id} cx={a.position} cy={a.positionY||0} r={.7} fill="#60a5fa"/>)}
    {tasks.map((t:any)=><circle key={t.sequence} cx={t.destination.x} cy={t.destination.y} r={t.radius} fill="none" stroke="#60a5fa" strokeWidth={.3}/>)}
    {valid&&<circle cx={Number(x)} cy={Number(y)} r={1} fill="#fde047"/>}
   </svg>
   <div className="command-position-coordinates"><label>横向坐标 <input aria-label="站位横向坐标" type="number" step="0.1" min={area.minX} max={area.maxX} value={x} disabled={locked} onChange={e=>setX(e.target.value)}/></label><label>纵向坐标 <input aria-label="站位纵向坐标" type="number" step="0.1" min={area.minY} max={area.maxY} value={y} disabled={locked} onChange={e=>setY(e.target.value)}/></label></div>
   <div className="command-position-actions"><button type="button" disabled={locked||!living.length||!valid} onClick={()=>request('moveTo',{memberIds:living,destination:{x:Number(x),y:Number(y)}})}>移动并保持站位</button>
   <button type="button" disabled={locked||!tasks.length} onClick={()=>request('cancelMove',{memberIds:ids})}>撤销所选站位任务</button></div>
   <ul aria-label="站位执行状态">{[...tasks,...history].map((t:any)=><li key={t.sequence}>{members.find((m:any)=>m.id===t.memberId)?.name||'已离场成员'}：{labels[t.status]}{t.reason?` · ${t.reason}`:''}</li>)}</ul>
  </div>
 </details>;
}
