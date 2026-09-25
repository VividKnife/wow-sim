"use client";
import {Button} from '@/components/ui/button';

export default function CombatRecoveryActions({state:s,busy,send,canLead=true,onRevive}:{state:any;busy:boolean;send:(command:any)=>Promise<any>;canLead?:boolean;onRevive?:()=>void}){
 if(!canLead)return null;
 if(s.combat)return <Button variant="destructive" disabled={busy} title="立即结束本场战斗，所有参战成员死亡，需要复活后重新挑战。" onClick={()=>send({type:'abandonCombat',encounterId:s.combat.id})}>放弃战斗（全员死亡）</Button>;
 if(!['idle','dead'].includes(s.activity.type)||![s,...s.party].some(c=>c.hp<=0))return null;
 return <Button disabled={busy} onClick={async()=>{if(await send({type:'revive'}))onRevive?.();}}>倒下成员返回尸体复活</Button>;
}
