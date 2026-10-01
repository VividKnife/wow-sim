import type {GameResponse} from '../../../packages/contracts/src/game';
export default function AccountControls(_props:{game:GameResponse;busy:boolean;send:(body:any)=>Promise<boolean>}){return <p className="footnote">使用「社交与组队」邀请玩家、管理队伍或打开地下城查找器。各角色的背包与金币独立保存。</p>;}
