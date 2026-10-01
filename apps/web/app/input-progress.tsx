import type {GameResponse} from '../../../packages/contracts/src/game';
import {inputReceiptPending} from '../lib/input-receipts.js';
export default function InputProgress({execution,waiting=false}:{execution?:GameResponse['execution'];waiting?:boolean}){
 const queued=!!execution?.pendingInputs;
 const confirming=execution?.receipts.some(receipt=>receipt.status!=='queued'&&inputReceiptPending(receipt));
 if(!waiting&&!queued&&!confirming)return null;
 return <div className="activity-strip" role="status">{queued?'指令已接收，正在等待执行…':'操作已执行，正在保存结果…'}</div>;
}
