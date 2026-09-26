// Real engine fixtures only; measures uncompressed JSON storage/wire payload,
// not browser FPS, database page usage or production network compression.
import {advance} from '../packages/game-domain/src/rules/engine.js';
import {projectLocalCheckpoint} from '../packages/game-domain/src/rules/local-checkpoint.js';
import {localScenarios} from '../packages/game-domain/test/support/local-scenarios.ts';
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
for(const [scenario,initial] of Object.entries(localScenarios())){
 const live=advance(initial,15000).state,checkpoint=projectLocalCheckpoint(live);
 const meta={ownerId:'owner',session:{id:'session',clientId:'client',expiresAt:45000,sequence:1,lastSeenAt:15000},serverNow:15000,contentVersion:'fixture',deadline:7215000,active:true};
 const full=bytes({...meta,state:live}),ack=bytes({...meta,itemIds:[]});
 console.log(JSON.stringify({scenario,atMs:15000,archivedBattles:live.battleHistory.length,fullStateBytes:bytes(live),checkpointBytes:bytes(checkpoint),fullResponseBytes:full,ackBytes:ack,roundTripReductionPercent:Math.round((1-(bytes(checkpoint)+ack)/(bytes(live)+full))*1000)/10}));
}
