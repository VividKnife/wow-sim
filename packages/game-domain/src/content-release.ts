import {LATEST_CONTENT_PHASE} from './rules/content-phase.js';
import type {ReadView} from '../../persistence/src/store.ts';
import type {Rules} from './model.ts';
export async function readContentPhase(tx:ReadView):Promise<number>{
 const release=await tx.get('content_releases','world');
 if(!release)return 1;
 if(!Number.isInteger(release.phase)||release.phase<1||release.phase>LATEST_CONTENT_PHASE)throw new Error('服务器内容阶段无效');
 return release.phase;
}
export async function applyContentPhase(tx:ReadView,state:Rules){
 const phase=await readContentPhase(tx);
 for(const actor of [state,...state.party||[]])actor.contentPhase=phase;
 return state;
}
