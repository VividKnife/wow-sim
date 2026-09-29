"use client";
import {useId,useRef,useState,type ReactNode} from 'react';
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from '@/components/ui/tooltip';
import {Icon} from './game-ui';
import './talent-tree.css';

export type TalentNode={id:number;tree:number;row:number;col:number;name:string;nameZhCN?:string;icon?:string;rank:number;maxRank:number;requiredTreePoints:number;canLearn:boolean;canRemove?:boolean;blockedReason?:string|null;supported?:boolean;prerequisites?:{talentId:number;requiredRank:number}[];rankEffects?:{descriptionZhCN?:string;descriptionEn?:string;description?:string}[];descriptions?:string[]};
export type TalentBranch={id:number;name:string;nameZhCN?:string;background?:string};
const names:Record<string,string>={Fire:'火焰',Frost:'冰霜',Arcane:'奥术'};
const label=(tree:TalentBranch)=>tree.nameZhCN||names[tree.name]||tree.name;
const name=(node:TalentNode)=>node.nameZhCN||node.name;
const background=(tree:TalentBranch)=>tree.background?.toLowerCase()||({41:'magefire',61:'magefrost',81:'magearcane'} as Record<number,string>)[tree.id];
const effect=(node:TalentNode,rank:number)=>{const text=node.rankEffects?.[rank-1];return text?.descriptionZhCN||text?.descriptionEn||text?.description||node.descriptions?.[rank-1]||'效果说明暂未收录。';};
const status=(node:TalentNode)=>node.rank===node.maxRank?'maxed':node.canLearn||node.rank>0?'available':'locked';

function Description({node,nodes}:{node:TalentNode;nodes:TalentNode[]}){
 return <><h3>{name(node)}</h3><div className="classic-talent-rank">等级 {node.rank} / {node.maxRank}{node.rank===node.maxRank?' · 已点满':''}</div>
  {node.rank>0&&<p>{effect(node,node.rank)}</p>}
  {node.rank<node.maxRank&&<div className="classic-talent-next"><strong>{node.rank?'下一等级':'第 1 级'}</strong><p>{effect(node,node.rank+1)}</p></div>}
  {node.requiredTreePoints>0&&<small>需要在本系投入 {node.requiredTreePoints} 点</small>}
  {node.prerequisites?.map(p=>{const parent=nodes.find(n=>n.id===p.talentId);return <small key={p.talentId} className={(parent?.rank||0)<p.requiredRank?'unmet':'met'}>需要 {parent?name(parent):'前置天赋'} {p.requiredRank} 点（{parent?.rank||0}/{p.requiredRank}）</small>;})}
  {node.supported===false&&<small className="unmet">当前战斗系统尚未实现此效果。</small>}
  {node.rank<node.maxRank&&node.blockedReason&&<small className="unmet">{node.blockedReason}</small>}
 </>;
}

export default function TalentTree({title,trees,nodes,available,busy,onLearn,onRemove,actions}: {title:string;trees:TalentBranch[];nodes:TalentNode[];available:number;busy:boolean;onLearn:(id:number)=>void|Promise<unknown>;onRemove?:(id:number)=>void;actions?:ReactNode}){
 const [selectedTree,setSelectedTree]=useState<number>(trees[0]?.id),[selectedNode,setSelectedNode]=useState<number|null>(null),[pending,setPending]=useState(false);
 const touch=useRef(false),inFlight=useRef(false),uid=useId().replace(/:/g,'');
 const tree=trees.find(t=>t.id===selectedTree)||trees[0],visible=nodes.filter(n=>n.tree===tree?.id).sort((a,b)=>a.row-b.row||a.col-b.col);
 const inspected=visible.find(n=>n.id===selectedNode),used=nodes.reduce((sum,n)=>sum+n.rank,0),treeUsed=visible.reduce((sum,n)=>sum+n.rank,0);
 const locked=busy||pending;
 const learn=async(node:TalentNode)=>{if(locked||inFlight.current||!node.canLearn)return;inFlight.current=true;setPending(true);try{await onLearn(node.id);}finally{inFlight.current=false;setPending(false);}};
 if(!tree)return <p className="classic-talents-empty">这个职业暂无可用天赋。</p>;
 const texture=background(tree);
 return <section className={`classic-talents${inspected?' has-inspection':''}`} aria-label={title} aria-busy={locked} onKeyDown={e=>{if(e.key==='Escape')setSelectedNode(null);}}>
  <header className="classic-talents-heading"><div><span className="classic-talents-eyebrow">天赋与专精</span><h2>{title}</h2></div><div className="classic-talents-points" role="status"><span>剩余天赋点数</span><strong>{available}</strong><small>已分配 {used} 点</small></div></header>
  <div className="classic-talents-body"><div className="classic-talents-book">
   <div className="classic-tree-heading"><h3>{label(tree)}</h3><span>{treeUsed} 点</span></div>
   <div className="classic-tree-frame"><div className="classic-tree-canvas">
    {texture&&<div className="classic-tree-art" aria-hidden="true">{['topleft','topright','bottomleft','bottomright'].map(part=><span key={part} style={{backgroundImage:`url(/interface/classic/talentframe/${texture}-${part}.png)`}}/>)}</div>}
    <svg className="classic-tree-links" viewBox="0 0 400 620" preserveAspectRatio="none" aria-hidden="true">
     <defs>{Object.entries({locked:['#686b61','#e1e0cc','#b1b4a3','#74796c'],available:['#327811','#a7ff58','#51d91d','#25780b'],maxed:['#94700c','#fff59b','#f5ce37','#aa7b09']}).map(([state,colors])=><linearGradient key={state} id={`${uid}-${state}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={colors[0]}/><stop offset=".3" stopColor={colors[1]}/><stop offset=".65" stopColor={colors[2]}/><stop offset="1" stopColor={colors[3]}/></linearGradient>)}</defs>
     {visible.flatMap(node=>(node.prerequisites||[]).map(p=>{
      const parent=visible.find(n=>n.id===p.talentId);if(!parent)return null;
      const unlocked=parent.rank>=p.requiredRank,state=unlocked?(node.rank===node.maxRank?'maxed':'available'):'locked';
      const x=58+parent.col*94,y=47+parent.row*86,tx=58+node.col*94,ty=47+node.row*86;
      // One closed silhouette joins the shaft and head without overlapping strokes.
      // Horizontal links reuse the same downward silhouette, rotated at the source.
      const horizontal=parent.row===node.row,direction=Math.sign(tx-x),start=horizontal?25:y+25,tip=horizontal?Math.abs(tx-x)-30:ty-30;
      const sx=horizontal?0:x,ex=horizontal?0:tx,bend=y+43,half=4,shoulder=tip-11;
      const left=sx===ex?`M ${sx-half} ${start} V ${shoulder}`:`M ${sx-half} ${start} V ${bend+half*direction} H ${ex-half} V ${shoulder}`;
      const right=sx===ex?`V ${start}`:`V ${bend-half*direction} H ${sx+half} V ${start}`;
      const path=`${left} H ${ex-10} L ${ex} ${tip} L ${ex+10} ${shoulder} H ${ex+half} ${right} Z`;
      return <g key={`${parent.id}-${node.id}`} data-prerequisite={`${parent.id}-${node.id}`} transform={horizontal?`translate(${x} ${y}) rotate(${-90*direction})`:undefined}>
       <path d={path} className="classic-talent-connector" fill={`url(#${uid}-${state})`}/>
       <path d={`M ${ex-8} ${shoulder+1} L ${ex} ${tip-2} L ${ex+8} ${shoulder+1}`} className="classic-talent-connector-bevel"/>
      </g>;
     }))}
    </svg>
    <TooltipProvider delayDuration={180}>{visible.map(node=><Tooltip key={node.id}><TooltipTrigger asChild><button type="button" className={`classic-talent-node ${status(node)} ${node.rank===0?'unspent':''} ${inspected?.id===node.id?'inspected':''}`} style={{left:`${(58+node.col*94)/4}%`,top:`${(47+node.row*86)/6.2}%`}}
     aria-label={`${name(node)}，等级 ${node.rank}/${node.maxRank}${node.canLearn?'，可投入天赋点':''}`} data-can-learn={!locked&&node.canLearn} aria-pressed={inspected?.id===node.id}
     onPointerDown={e=>{touch.current=e.pointerType!=='mouse';}} onFocus={()=>setSelectedNode(node.id)}
     onClick={()=>{setSelectedNode(node.id);if(!touch.current)void learn(node);touch.current=false;}}
     onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')touch.current=false;if(onRemove&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();if(!locked&&node.canRemove)onRemove(node.id);}}}
     onContextMenu={e=>{e.preventDefault();setSelectedNode(node.id);if(onRemove&&!locked&&node.canRemove)onRemove(node.id);}}>
     <Icon src={node.icon} name={name(node)} size={48} showTitle={false}/><span className="classic-talent-counter">{node.rank}/{node.maxRank}</span>
    </button></TooltipTrigger><TooltipContent className="classic-talent-tooltip" side="right" sideOffset={12} collisionPadding={16}><Description node={node} nodes={nodes}/>{node.canLearn&&<small className="met">点击投入 1 点</small>}</TooltipContent></Tooltip>)}</TooltipProvider>
    {!visible.length&&<p className="classic-talents-empty">这个天赋系暂无可用节点。</p>}
   </div></div>
   <nav className="classic-tree-tabs" aria-label="天赋系">{trees.map(branch=><button type="button" key={branch.id} aria-pressed={tree.id===branch.id} onClick={()=>{setSelectedTree(branch.id);setSelectedNode(null);}}><span>{label(branch)}</span><b>{nodes.filter(n=>n.tree===branch.id).reduce((sum,n)=>sum+n.rank,0)}</b></button>)}</nav>
  </div><aside className="classic-talents-sidebar">
   <div className="classic-talent-inspect" aria-label="天赋详情">{inspected?<><button type="button" className="classic-talent-close" aria-label="关闭天赋详情" onClick={()=>setSelectedNode(null)}>×</button><div className="classic-talent-inspect-title"><Icon src={inspected.icon} name={name(inspected)} size={40}/><span>{label(tree)}天赋</span></div><Description node={inspected} nodes={nodes}/><div className="classic-talent-controls"><button type="button" disabled={locked||!inspected.canLearn} onClick={()=>void learn(inspected)}>投入 1 点</button>{onRemove&&<button type="button" disabled={locked||!inspected.canRemove} onClick={()=>onRemove(inspected.id)}>退还 1 点</button>}</div></>:<div className="classic-talent-placeholder"><span aria-hidden="true">✦</span><h3>选择一项天赋</h3><p>悬停查看效果，点击图标投入天赋点。</p><p>触屏点击图标查看说明，再选择「投入 1 点」。</p></div>}</div>
   <div className="classic-talents-guide"><h3>天赋研习</h3><p>10 级起，每升一级获得 1 点天赋。每深入一层，需要在本系投入额外 5 点。</p><div className="classic-talents-legend"><span className="available">◆ 可学习／已投入</span><span className="maxed">◆ 已点满</span><span>◆ 未解锁</span></div><p>{onRemove?'右键或 Delete 退还一点；须满足后续天赋的层级和前置要求。':'投入立即生效。重新分配天赋需前往职业训练师。'}</p></div>
   {actions&&<div className="classic-talents-actions">{actions}</div>}
  </aside></div>
 </section>;
}
