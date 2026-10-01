/** Issued by the owning character/instance, never by persistence. Allocation is
 * deterministic and consumes no combat RNG. The cursor belongs in checkpoints. */
export function itemIdentity(owner, sequence=owner.itemSequence+1){
 if(typeof owner.id!=='string'||!owner.id||owner.id.length>200)throw new Error('无效的物品身份空间');
 if(!Number.isSafeInteger(sequence)||sequence<1)throw new Error('物品序号已耗尽或无效');
 return `item:${encodeURIComponent(owner.id)}:${sequence}`;
}
export function nextItemIdentity(owner){
 const identity=itemIdentity(owner);
 owner.itemSequence++;
 return identity;
}
