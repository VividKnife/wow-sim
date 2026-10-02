import {Button} from '@/components/ui/button';
import {GameProps,money} from './game-ui';
import ClassCompanion from './class-companion';

export default function HunterPets({stableService=false,...props}:GameProps&{stableService?:boolean}){
 const {state:s,data:d,busy,send}=props,stable=d.petStable;
 if(s.classId!==3)return <p>兽栏只为猎人服务。</p>;
 const current=stable?.current,pet=s.pet;
 const revive=d.skillUses?.[982],call=d.skillUses?.[883];
 return <section className="panel" aria-label={stableService?'兽栏管理员':'猎人宠物'}>
  <h3>{stableService?'兽栏管理员':'我的宠物'}</h3>
  <p>{pet?pet.hp>0?`${pet.name}正在出战 · 生命 ${Math.ceil(pet.hp)} / ${pet.maxHp}`:`${pet.name}已经死亡，可施放复活宠物。`:current?`${current.name}已解散，可施放召唤宠物。`:'目前没有随行宠物。可以驯服野兽，或到兽栏管理员处领出已存放的宠物。'}</p>
  {!stableService&&<>
   <div className="filterbar">
    {pet?.hp<=0&&s.learned.includes(982)&&<Button disabled={busy||!revive?.canUse} title={revive?.reason||''} onClick={()=>send({type:'cast',id:982})}>复活宠物</Button>}
    {!pet&&current&&s.learned.includes(883)&&<Button disabled={busy||!call?.canUse} title={call?.reason||''} onClick={()=>send({type:'cast',id:883})}>召唤宠物</Button>}
   </div>
   {pet&&<><p>宠物用训练点学习技能；可用技能和花费列在下方。先向训练师学习“野兽训练”后即可分配训练点。</p><ClassCompanion {...props} showOther={false}/></>}
  </>}
  <h3>兽栏 · {stable?.capacity||0} / 2 个位置</h3>
  <p>一只宠物随行，最多两只存入兽栏。存放和领出需要与兽栏管理员交谈。</p>
  <div className="city-stock">{stable?.slots.map((stored:any,index:number)=><div className="city-stock-row" key={index}>
   <div className="grow"><strong>位置 {index+1} · {stored?.name||((stable.capacity||0)>index?'空':'未解锁')}</strong>{stored&&<small>等级 {stored.level} · 忠诚度 {stored.loyalty||1}/6 · 训练点 {stored.trainingPoints||0}</small>}</div>
   {stableService&&((stable.capacity||0)<=index?<Button variant="outline" disabled={busy||!d.city?.canInteract||index!==stable.capacity||s.money<stable.prices[index]} onClick={()=>send({type:'petStable',operation:'buy',slot:index})}>解锁 · {money(stable.prices[index])}</Button>:stored?<Button variant="outline" disabled={busy||!d.city?.canInteract||pet?.hp<=0} onClick={()=>send({type:'petStable',operation:'withdraw',slot:index})}>{current?'交换宠物':'领出宠物'}</Button>:<Button variant="outline" disabled={busy||!d.city?.canInteract||!current||pet?.hp<=0} onClick={()=>send({type:'petStable',operation:'store',slot:index})}>存放当前宠物</Button>)}
  </div>)}</div>
  {!stableService&&!stable?.here&&<p>前往城镇，在“世界 → 附近人物 → 兽栏”找到兽栏管理员，可解锁位置并交换宠物。</p>}
 </section>;
}
