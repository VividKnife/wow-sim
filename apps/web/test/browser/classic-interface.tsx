// Real settings and NPC components; commands only affect this disposable in-memory character.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Dialog} from 'radix-ui';
import {X} from 'lucide-react';
import {createGame,act,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import GameSettings from '../../app/game-settings';
import LocalNpcs from '../../app/local-npcs';
import {Button} from '../../components/ui/button';
import {GameSelect,GameSelectOption} from '../../components/ui/game-select';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../../components/ui/tabs';
import '../../app/globals.css';
import '../../app/classic-game.css';
const content=clientContent();
function Preview(){
 const [s,setState]=useState(()=>{const s=createGame('界面预览',42,0);s.location='goldshire';s.level=4;return s;});
 const [panel,setPanel]=useState<string|null>('settings'),[quality,setQuality]=useState('high');
 const send=async(command:any)=>{setState(current=>act(current,command,current.wallAt));return true;};
 const title=panel==='settings'?'游戏设置':panel==='nearby'?'附近人物':'界面控件';
 return <main className="classic-game-root" style={{minHeight:'100dvh',padding:24,background:'radial-gradient(ellipse at top,#383b29,#0c100c 75%)'}}>
  <div className="action-row"><Button onClick={()=>setPanel('settings')}>游戏设置</Button><Button variant="outline" onClick={()=>setPanel('controls')}>界面控件</Button><Button variant="outline" onClick={()=>setPanel('nearby')}>附近人物</Button></div>
  <Dialog.Root open={!!panel} onOpenChange={open=>{if(!open)setPanel(null);}}><Dialog.Portal><Dialog.Overlay className="cu-dialog-overlay"/><Dialog.Content className={`cu-dialog cu-live-dialog cu-panel-${panel}`}><header className="cu-dialog-header"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>独立界面预览 · 不连接正式存档</Dialog.Description></div><Dialog.Close className="cu-close" aria-label="关闭窗口"><X size={20}/></Dialog.Close></header><div className="cu-dialog-body">
   {panel==='settings'&&<GameSettings state={s} busy={false} send={send} onClose={()=>setPanel(null)}/>}
   {panel==='nearby'&&<LocalNpcs state={s} data={{...content,...view(s)}} busy={false} send={send}/>}
   {panel==='controls'&&<><section className="panel"><h2>按钮与状态</h2><div className="action-row"><Button>接受</Button><Button variant="outline">取消</Button><Button variant="secondary">查看详情</Button><Button variant="destructive">删除</Button><Button variant="ghost">帮助</Button><Button disabled>不可用</Button></div></section><section className="panel"><h2>选项与输入</h2><div className="action-row"><GameSelect aria-label="画质预设" value={quality} onValueChange={setQuality}><GameSelectOption value="high">高画质</GameSelectOption><GameSelectOption value="low">流畅</GameSelectOption></GameSelect><input aria-label="搜索" placeholder="搜索物品…"/><label><input type="checkbox" defaultChecked/> 显示可用物品</label></div></section><Tabs defaultValue="bag"><TabsList aria-label="物品分类"><TabsTrigger value="bag">背包</TabsTrigger><TabsTrigger value="bank">银行</TabsTrigger><TabsTrigger value="locked" disabled>未解锁</TabsTrigger></TabsList><TabsContent value="bag"><section className="panel"><h2>背包</h2><p>物品品质颜色与生命、法力颜色保留原有含义。</p></section></TabsContent><TabsContent value="bank"><section className="panel"><h2>银行</h2></section></TabsContent></Tabs></>}
  </div></Dialog.Content></Dialog.Portal></Dialog.Root>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
