// The viewer takes inventory types, not our normalized character equipment slots.
export function modelEquipment(equipment,items){
 return Object.entries(equipment).sort(([a],[b])=>Number(a)-Number(b)).flatMap(([position,instance])=>{
  const item=items[instance.id];
  if(!item||[2,11,12].includes(item.slot)||![1,3,4,5,6,7,8,9,10,15,16,17,18,19].includes(Number(position)))return [];
  const slot=Number(position)===16?21:Number(position)===17?22:Number(position)===18?26:item.slot;
  return [{id:item.appearanceItemId||instance.id,slot}];
 });
}
