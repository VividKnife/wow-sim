"use client";
import {useState} from 'react';
import {Flag,Shield,Swords,Heart,Move,Target,Users,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {useLocalBattleground} from '@/lib/local-combat-store';
import type {GameProps} from './game-ui';
import type {BattlegroundPoint,BattlegroundMap,BattlegroundMatch,BattlegroundFlag,BattlegroundMember,BattlegroundView} from '../../../packages/contracts/src/battleground';
import './battleground.css';

const taskIcons:Record<string,typeof Flag>={capture:Flag,defend:Shield,escort:Heart,recover:Target,midfield:Swords,rally:Move};
const roleNames:Record<string,string>={tank:'防护',healer:'治疗',ranged:'远程',melee:'近战'};
const clock=(ms:number)=>`${Math.floor(Math.max(0,ms)/60000)}:${String(Math.floor(Math.max(0,ms)/1000)%60).padStart(2,'0')}`;
const flagName=(flag:BattlegroundFlag,match:BattlegroundMatch)=>flag.status==='base'?'旗帜安全':flag.status==='resetting'?'等待重置':flag.status==='dropped'?`掉落 · ${Math.max(0,Math.ceil((flag.returnAt-match.clock)/1000))}秒归位`:`${match.teams.flatMap((t)=>t.members).find((c:BattlegroundMember)=>c.id===flag.carrierId)?.name||'旗手'}携带`;

function Field({map,match,selected=[],onToggle,pointId,onPoint}:{map:BattlegroundMap;match?:BattlegroundMatch;selected?:string[];onToggle?:(id:string)=>void;pointId?:string;onPoint?:(id:string)=>void}){
 const nodes:Record<string,BattlegroundPoint>=Object.fromEntries(map.nodes.map((n)=>[n.id,n]));
 const units=match?.teams.flatMap((t)=>t.members)||[];
 // Spread overlapping tactical counters without changing simulation positions.
 const markers=new Map<string,{x:number;y:number}>();
 for(const c of units.filter((c:BattlegroundMember)=>c.hp>0)){
  let found=false;
  for(let ring=0;ring<=5&&!found;ring++)for(let i=0;i<(ring?ring*8:1);i++){
   const angle=i/(ring*8||1)*Math.PI*2,p={x:Math.max(3,Math.min(157,c.x+Math.cos(angle)*ring*3)),y:Math.max(5,Math.min(94,c.y+Math.sin(angle)*ring*3))};
   if([...markers.values()].every(other=>Math.hypot(p.x-other.x,p.y-other.y)>=5.7)){markers.set(c.id,p);found=true;break;}
  }
  if(!found)markers.set(c.id,{x:c.x,y:c.y});
 }
 const position=(c:BattlegroundMember)=>markers.get(c.id)||{x:c.x,y:c.y};
 return <div className="wsg-field"><svg viewBox="0 0 160 100" aria-label="战歌峡谷战术地图：左侧银翼基地、右侧战歌基地；隧道、北侧坡道及南侧侧翼相连">
  <defs><linearGradient id="wsg-ground" x2="1" y2="1"><stop stopColor="#293e35"/><stop offset=".5" stopColor="#414633"/><stop offset="1" stopColor="#3f3027"/></linearGradient><pattern id="wsg-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#d4c08b" strokeOpacity=".045" strokeWidth=".2"/></pattern></defs>
  <rect width="160" height="100" rx="2" fill="url(#wsg-ground)"/><rect width="160" height="100" fill="url(#wsg-grid)"/>
  <path d="M69 0Q65 22 79 33T83 61T95 100" fill="none" stroke="#76815b" strokeOpacity=".14" strokeWidth="13"/>
  {Array.from({length:38},(_,i)=>{const x=3+(i*37)%153,y=i%2?89+(i%4):6+(i%6);return <g key={i} opacity=".45"><circle cx={x+1} cy={y+1} r="3" fill="#111d18"/><path d={`M${x} ${y-4}l-3 6h6z`} fill={i%3?'#1b3024':'#43573a'}/></g>;})}
  {map.edges.map(([a,b]:string[])=><g key={a+b}><path d={`M${nodes[a].x} ${nodes[a].y}L${nodes[b].x} ${nodes[b].y}`} stroke="#141d18" strokeOpacity=".4" strokeWidth="6"/><path d={`M${nodes[a].x} ${nodes[a].y}L${nodes[b].x} ${nodes[b].y}`} stroke="#b09b6b" strokeOpacity=".27" strokeWidth="4.5"/></g>)}
  <path d="M80 8v84" stroke="#cab88a" strokeOpacity=".12" strokeDasharray="1 2" strokeWidth=".3"/>
  {map.walls.map((w,i:number)=><g key={i}><rect x={w.x+.8} y={w.y+1} width={w.w} height={w.h} rx="1" fill="#10171388"/><rect x={w.x} y={w.y} width={w.w} height={w.h} rx="1" fill="#555546" stroke="#8e8160" strokeWidth=".4"/><path d={`M${w.x+1} ${w.y+2}h${w.w-2}m0 3H${w.x+1}m0 3h${w.w-2}`} stroke="#272e26" strokeWidth=".4"/></g>)}
  {map.teams.map((t,i:number)=><g key={t.base}><rect x={i?139:3} y="41" width="18" height="18" rx="2" fill={t.color+'16'} stroke={t.color+'77'} strokeWidth=".3"/><text x={i?147:13} y="66" textAnchor="middle" fill={t.color} fontSize="3.1" fontWeight="700">{t.name}基地</text><text x={nodes[t.graveyard].x} y="87" textAnchor="middle" fill="#c6b991" fontSize="2.6">✦ 墓地</text></g>)}
  <text x="80" y="43" textAnchor="middle" fill="#d5c698" opacity=".65" fontSize="3.5" letterSpacing="2">争夺之地</text>
  {map.nodes.map((n)=><g key={n.id} role={onPoint?'button':undefined} tabIndex={onPoint?0:undefined} aria-label={`集合点：${n.name}`} onClick={()=>onPoint?.(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPoint?.(n.id);}}} className={onPoint?'wsg-map-point':''}>
   <circle cx={n.x} cy={n.y} r="4" fill="transparent"/><circle cx={n.x} cy={n.y} r={pointId===n.id?3:1} fill={pointId===n.id?'#e7c77a33':'#d1bb7b55'} stroke={pointId===n.id?'#f2d594':'none'} strokeWidth=".4"/>
   <title>{n.name}{onPoint?' · 点击设为集合点':''}</title>
   {['blue-tunnel','red-tunnel','blue-ramp','red-ramp','mid-top','mid-bottom'].includes(n.id)&&<text x={n.x} y={n.y-6} textAnchor="middle" fill="#c5c6ab" fontSize="2.4">{n.name}</text>}
  </g>)}
  {(match?.buffs||map.buffs).map((b)=><g key={b.id} opacity={match && (b.readyAt||0)>match.clock ? .25 : 1}><circle cx={nodes[b.node].x} cy={nodes[b.node].y+5} r="1.7" fill="#d6b46b" opacity={match&&(b.readyAt||0)>match.clock?'.3':'.8'}/><text x={nodes[b.node].x} y={nodes[b.node].y+5.9} fontSize="2.5" textAnchor="middle" fill="#20271c">{b.kind==='speed'?'»':b.kind==='berserk'?'⚔':'+'}</text><title>{b.name}</title></g>)}
  {match?.effects.map((e,i:number)=>{const a=units.find((c:BattlegroundMember)=>c.id===e.from),b=units.find((c:BattlegroundMember)=>c.id===e.to);return a&&b?<line key={i} x1={position(a).x} y1={position(a).y} x2={position(b).x} y2={position(b).y} stroke={e.kind==='heal'?'#90e7aa':'#f6d58c'} strokeWidth=".45" opacity=".65"/>:null;})}
  {units.filter((c:BattlegroundMember)=>c.hp>0).map((c:BattlegroundMember)=>{const p=position(c),chosen=selected.includes(c.id),friendly=c.side===0;return <g key={c.id} role={friendly&&onToggle?'button':undefined} tabIndex={friendly&&onToggle?0:undefined} aria-label={`${c.number}号 ${c.name}${friendly?'，选择队员':''}`} aria-pressed={friendly?chosen:undefined} onClick={()=>friendly&&onToggle?.(c.id)} onKeyDown={e=>{if(friendly&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onToggle?.(c.id);}}} className="wsg-unit">
   <circle cx={p.x} cy={p.y} r="2.5" fill="#071016" stroke={chosen?'#f4de9c':map.teams[c.side].color} strokeWidth={chosen?'.65':'.4'}/>
   {c.role==='healer'&&<path d={`M${p.x-1} ${p.y-3.7}h2m-1-1v2`} stroke="#91daa0" strokeWidth=".4"/>}
   <text x={p.x} y={p.y+.95} textAnchor="middle" fontSize="2.7" fontWeight="700" fill={map.teams[c.side].color}>{c.number}</text>
   <rect x={p.x-2.5} y={p.y+3} width="5" height=".7" fill="#081015"/><rect x={p.x-2.5} y={p.y+3} width={5*c.hp/c.maxHp} height=".7" fill={c.hp/c.maxHp<.3?'#f47968':'#87b777'}/>
   {c.stunnedUntil>(match?.clock||0)&&<text x={p.x} y={p.y-3} textAnchor="middle" fontSize="3" fill="#ffe5a0">✧</text>}
   <title>{c.name} · {c.className} · {Math.ceil(c.hp/c.maxHp*100)}% · {c.intent}</title>
  </g>;})}
  {(match?.flags||map.teams.map((t,i:number)=>({side:i,status:'base' as const,carrierId:null,returnAt:0,...nodes[t.base]}))).filter((f)=>f.status!=='resetting').map((f)=>{const unit=units.find((c:BattlegroundMember)=>c.id===f.carrierId),p=unit?position(unit):f;return <g key={f.side} className="wsg-flag" pointerEvents="none"><path d={`M${p.x+3} ${p.y-1}v-8l5 1.5-5 2`} stroke={map.teams[f.side].color} fill={map.teams[f.side].color} strokeWidth=".5"/><title>{map.teams[f.side].name}旗帜</title></g>;})}
 </svg><div className="wsg-map-legend"><span><i className="wsg-blue-dot"/>银翼队 · 我方</span><span><i className="wsg-red-dot"/>战歌队 · 对手</span><span>＋ 治疗　⚑ 持旗　✧ 受控</span><span>点击队员多选 · 点击地点设置集合点</span></div></div>;
}

function Match({match,map,orders,routes,busy,send}:{match:BattlegroundMatch;map:BattlegroundMap;orders:BattlegroundView['orders'];routes:BattlegroundView['routes'];busy:boolean;send:GameProps['send']}){
 const [selected,setSelected]=useState<string[]>([]),[route,setRoute]=useState('tunnel'),[pointId,setPointId]=useState('mid'),[feedback,setFeedback]=useState('');
 const [confirmLeave,setConfirmLeave]=useState(false);
 const team=match.teams[0],finished=match.phase==='finished',preparing=match.phase==='preparing';
 const toggle=(id:string)=>setSelected(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
 const command=async(type:string,extra:Record<string,unknown>={})=>send({type,matchId:match.id,revision:match.revision,...extra});
 const order=async(task:string)=>{if(await command('battlegroundOrder',{memberIds:selected,task,route,pointId}))setFeedback(`已向${selected.length}人下达${orders.find(o=>o.id===task)?.name}命令`);};
 return <>
  <div className="wsg-score-strip"><div className="wsg-side blue"><Flag size={21}/><div><strong>{team.name}</strong><small>{flagName(match.flags[0],match)}</small></div><b>{match.score[0]}</b></div><div className="wsg-timer"><strong>{preparing?'战前部署':match.phase==='countdown'?`${Math.ceil((match.startedAt-match.clock)/1000)} 秒后开战`:clock(match.clock-match.startedAt)}</strong><small>{finished?'战场结束':'率先夺取 3 面旗帜'}</small></div><div className="wsg-side red"><b>{match.score[1]}</b><div><strong>{match.teams[1].name}</strong><small>{flagName(match.flags[1],match)}</small></div><Flag size={21}/></div></div>
  {finished&&<div className="wsg-result" role="status"><Flag/><div><strong>{match.result?.winner===0?'战歌峡谷 · 胜利':'战歌峡谷 · 落败'}</strong><p>{match.result?.reason} · {clock(match.result?.durationMs||0)} · {match.score.join(' : ')}</p></div><Button disabled={busy} onClick={()=>void send({type:'battlegroundPrepare'})}>再战一场</Button></div>}
  {match.pressure>0&&<p className="wsg-pressure" role="status">双方持旗僵持：旗手受到的伤害提高 {match.pressure*10}%。组织追旗小队打破僵局。</p>}
  <div className="wsg-layout"><div className="wsg-map-column"><Field map={map} match={match} selected={selected} onToggle={finished?undefined:toggle} pointId={pointId} onPoint={finished?undefined:setPointId}/>
   <div className="wsg-roster-title"><strong><Users size={15}/> 我方十人小队</strong><span>下一轮墓地复活 {Math.ceil(match.resurrectionInMs/1000)} 秒</span></div>
   <div className="wsg-roster">{team.members.map((c:BattlegroundMember)=>{const held=match.flags.some((f)=>f.carrierId===c.id),task=orders.find(o=>o.id===c.order.task);return <button key={c.id} className={`wsg-member ${selected.includes(c.id)?'selected':''} ${c.hp<=0?'dead':''}`} aria-pressed={selected.includes(c.id)} disabled={finished} onClick={()=>toggle(c.id)} title={`${c.intent} · ${routes.find(r=>r.id===c.order.route)?.name}`}>
    <span className="wsg-member-number">{c.number}</span><span className="wsg-member-info"><strong>{c.name}{held&&<Flag size={12}/>}</strong><small>{c.className} · {roleNames[c.role]}<em>{task?.short}</em></small><span className="wsg-health"><i style={{width:`${Math.max(0,c.hp/c.maxHp*100)}%`}}/></span><small>{c.hp<=0?`${Math.ceil((c.respawnAt-match.clock)/1000)}秒后复活`:c.cast?'施放治疗':c.stunnedUntil>(match?.clock||0)?'被控制':c.intent}</small></span>
   </button>;})}</div>
  </div><aside className="wsg-command"><div className="wsg-command-title"><span>战场指挥</span><small>命令即时生效</small></div>
   <div className="wsg-selection"><strong>已选 {selected.length} / 10 人</strong><div><button onClick={()=>setSelected(team.members.map((c:BattlegroundMember)=>c.id))} disabled={finished}>全选</button><button onClick={()=>setSelected([])}>清空</button></div></div>
   <div className="wsg-group-buttons">{orders.map(o=><button key={o.id} disabled={finished} onClick={()=>setSelected(team.members.filter((c:BattlegroundMember)=>c.order.task===o.id).map((c:BattlegroundMember)=>c.id))}>{o.short}组 <b>{team.members.filter((c:BattlegroundMember)=>c.order.task===o.id).length}</b></button>)}</div>
   <label className="wsg-route">行进路线<GameSelect aria-label="战场行进路线" value={route} onValueChange={setRoute} disabled={busy||finished}>{routes.map(r=><GameSelectOption key={r.id} value={r.id}>{r.name}</GameSelectOption>)}</GameSelect></label>
   <div className="wsg-order-buttons">{orders.map(o=>{const Icon=taskIcons[o.id];return <button key={o.id} disabled={busy||finished||!selected.length} onClick={()=>void order(o.id)} title={o.description}><Icon size={18}/><span><strong>{o.name}</strong><small>{o.id==='rally'?map.nodes.find((n)=>n.id===pointId)?.name:o.description}</small></span><ChevronRight size={14}/></button>;})}</div>
   <label className="wsg-route">集合位置<GameSelect aria-label="战场集合位置" value={pointId} onValueChange={setPointId} disabled={finished}>{map.nodes.map((n)=><GameSelectOption key={n.id} value={n.id}>{n.name}</GameSelectOption>)}</GameSelect></label>
   <p className="wsg-hint">先选队员，再下令。持旗者优先返家；旗手倒下，附近队友自动接旗。命令在阵亡后保留。</p><p className="wsg-feedback" role="status">{feedback}</p>
   {preparing?<div className="wsg-match-actions"><Button disabled={busy} onClick={()=>void command('battlegroundStart')}>部署完成 · 开始战场</Button><Button variant="ghost" disabled={busy} onClick={()=>void command('battlegroundCancel')}>取消准备</Button></div>:!finished&&<div className="wsg-match-actions">{confirmLeave?<><p>撤离将判定本场落败。</p><Button variant="destructive" disabled={busy} onClick={()=>void command('battlegroundSurrender')}>确认撤离</Button><Button variant="ghost" onClick={()=>setConfirmLeave(false)}>继续战斗</Button></>:<Button variant="outline" onClick={()=>setConfirmLeave(true)}>撤离战场</Button>}</div>}
  </aside></div>
  <div className="wsg-report-grid"><section className="wsg-events"><h3>战场动态</h3><ol aria-label="战场事件">{[...match.events].reverse().slice(0,8).map((e)=><li key={e.id} data-kind={e.kind}><time>{clock(e.at-match.startedAt)}</time><span>{e.text}</span></li>)}</ol></section>
  <details className="wsg-stats" open={finished}><summary>战绩统计 · 双方20人</summary><div className="wsg-table-scroll"><table><thead><tr><th>队员</th><th>击杀</th><th>阵亡</th><th>伤害</th><th>治疗</th><th>交旗</th><th>还旗</th></tr></thead><tbody>{match.teams.flatMap((t)=>t.members).map((c:BattlegroundMember)=><tr key={c.id} className={c.side?'red':'blue'}><th>{c.number}. {c.name}</th>{(['kills','deaths','damage','healing','captures','returns'] as const).map(k=><td key={k}>{Math.round(c.score[k])}</td>)}</tr>)}</tbody></table></div></details></div>
 </>;
}
export default function Battleground({data,busy,send}:GameProps){
 const bg=useLocalBattleground(data.battleground);
 if(!bg)return <p role="status">正在加载战场…</p>;
 return <section className="wsg-page"><header className="wsg-heading"><div><span className="wsg-eyebrow">BATTLEGROUNDS / 10 VS 10</span><h2><Flag size={24}/> 战歌峡谷</h2><p>夺取旗帜，护送归营。每一次调度，都决定战局。</p></div><span className="wsg-level">20级开放</span></header>
  {bg.match?<Match key={bg.match.id} match={bg.match} map={bg.map} orders={bg.orders} routes={bg.routes} busy={busy} send={send}/>:<div className="wsg-lobby"><Field map={bg.map}/><div className="wsg-enlist"><span className="wsg-eyebrow">夺旗战 · 指挥官席位</span><h3>集结你的十人战队</h3><p>主角与当前同级、存活的队友出战，志愿队员补足十人。对手为另一支十人 NPC 战队。</p><div className="wsg-lobby-facts"><span><Flag/>三旗获胜</span><span><Shield/>己旗归位才能交旗</span><span><Users/>30秒集体复活</span></div><Button disabled={busy||!!bg.blockedReason} onClick={()=>void send({type:'battlegroundPrepare'})}>进入战场 · 战前部署</Button>{bg.blockedReason&&<p role="status" className="wsg-lock">{bg.blockedReason}</p>}<small>已参加 {bg.record.played} 场 · 获胜 {bg.record.won} 场 · 交旗 {bg.record.captures} 次</small></div></div>}
  <details className="wsg-rules"><summary>战场规则与指挥指南</summary><div><p>双方各10人，率先交回3面敌旗获胜。携旗回到己方旗室且己旗在旗座，才能得分；双方同时持旗时，护旗队守住旗手，追旗队击杀敌方旗手并归还己旗。</p><p>旗手死亡掉旗，队友可以接力拾取，原属队触碰即归还，10秒无人拾取自动归位。得分后10秒重置旗帜。阵亡者每30秒在己方墓地集体复活。</p><p>隧道最直接，坡道经过北侧高台，侧翼沿南侧绕行。地图上的疾速、狂暴与恢复增益每60秒刷新。双方持续持旗3分钟后，旗手逐步受到额外伤害，最高提高100%。</p><p>可在战前和战中多选任意己方队员，实时下达任务。治疗者优先救助附近低血量队友和旗手；持旗者自动返家，己旗失窃时退守高台。集合命令可组织撤退与集体进攻。</p><p>本场为独立模拟，使用简化职业战斗：近战、远程、治疗、减速与控制。不会消耗世界中的生命、装备或物品。比赛分队与世界阵营关系无关。</p></div></details>
 </section>;
}
