import {items,icon,nameOf} from './catalog.js';
import {countItem,takeItem,addItem,spellInfo,log} from './character.js';

const tools={7207:{quest:1861,node:'mirror',place:'明镜湖瀑布',label:'在瀑布下装满水瓶',result:7206},7308:{quest:1920,node:'bluerecluse',place:'蓝色隐士',label:'念诵显形咒文'},7247:{quest:1920,node:'bluerecluse',place:'蓝色隐士',label:'捕获裂隙怒灵'}};
const weakened=s=>s.combat?.quest===1920&&s.combat.enemies.find(e=>e.capturePhase==='weakened'&&e.captureUntil>s.clock);
export function questTools(s){return Object.entries(tools).filter(([id,t])=>s.quests[t.quest]&&countItem(s,+id)>0).map(([id,t])=>({id:+id,name:nameOf('items',id),icon:icon('items',id),label:t.label,location:t.node,place:t.place,available:s.location===t.node&&['idle','hunt'].includes(s.activity.type)&&s.clock>=(s.itemCooldowns?.[id]||0)&&(+id===7247?!!weakened(s)&&(s.bag.find(i=>i.id===7247)?.charges??10)>0:!s.combat)}));}
export function beginQuestTool(s,id){
 const tool=tools[id];if(!tool||!s.quests[tool.quest]||!countItem(s,id))throw new Error('没有可用的任务物品。');
 if(s.location!==tool.node)throw new Error('请先前往'+tool.place+'。');
 if(!['idle','hunt'].includes(s.activity.type)||s.combat&&id!==7247)throw new Error('请先结束当前活动。');
 if(s.clock<(s.itemCooldowns?.[id]||0))throw new Error('任务物品尚未冷却。');
 if(tool.result&&countItem(s,tool.result))throw new Error('已经取得这份任务物品。');
 if(id===7247&&!weakened(s))throw new Error('需要先削弱显形的裂隙怒灵。');
 if(id===7247&&(s.bag.find(i=>i.id===id).charges??10)<=0)throw new Error('收容箱的使用次数已用尽，请重新领取工具。');
 if(id===7308&&countItem(s,7292)>=3)throw new Error('已经收集足够的封灵箱。');
 const spell=spellInfo(s,items[id].spellid_1);
 s.rest=null;s.activity={type:'questItem',item:id,quest:tool.quest,startedAt:s.clock,endsAt:s.clock+spell.castMs};
 log(s,tool.label,'quest');
}
export function finishQuestTool(s){
 const {item,quest}=s.activity,tool=tools[item];
 if(!tool||!s.quests[quest]||s.location!==tool.node||!countItem(s,item))return;
 s.itemCooldowns??={};s.itemCooldowns[item]=s.clock+Math.max(0,items[item].spellcooldown_1);
 if(item===7308)return [6492];
 if(item===7247){const target=weakened(s);if(!target){log(s,'捕获失败：裂隙怒灵已经消散。','quest');return;}const box=s.bag.find(i=>i.id===7247);box.charges=(box.charges??10)-1;target.capturePhase='captured';target.captureUntil=s.clock+2500;s.questObjects??=[];s.questObjects.push({id:103574,quest:1920,location:s.location,availableAt:target.captureUntil});log(s,'裂隙怒灵被吸入封灵箱。','quest');return;}
 takeItem(s,item,1);addItem(s,tool.result,1);log(s,'获得 '+nameOf('items',tool.result),'quest');
}
