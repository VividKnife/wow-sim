import {useCombatPlayback} from '@/lib/use-combat-playback';
import type {GameProps} from './game-ui';
import ActivityProgress from './activity-progress';

// Subscribe independently so cast completion follows the scene between overview polls.
export default function LiveCastBar({state,data,playback,contentVersion}:Pick<GameProps,'state'|'data'|'playback'|'contentVersion'>){
 const {state:s,data:d}=useCombatPlayback(state,data,playback,contentVersion,true);
 const casting=!!s.cast||['hearth','teleport','conjure','classSpell','classChannel','mount'].includes(s.activity.type);
 return casting?<div className="cu-quickbar-cast"><ActivityProgress state={s} data={d} quartz running={!s.combat?.command?.paused}/></div>:null;
}
