// Automatic route advancement is a room policy, not a character action lock.
export const personalBuildActions=new Set(['equip','equipBag','talent','resetTalents']);
export function buildChangeBlocked(room,actor=room){
 if(room.combat||['countdown','combat'].includes(room.arena?.phase)||['countdown','combat'].includes(room.battleground?.phase))return '战斗中无法调整装备或天赋。';
 if(actor.hp<=0)return '角色已死亡，请先复活。';
 if(actor.cast)return '请先完成或停止当前施法。';
 return '';
}
