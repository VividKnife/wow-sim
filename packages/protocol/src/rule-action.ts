/** Public intentions only. State, random values, effective times, damage and
 * rewards have no fields in this protocol. Domain rules validate applicability. */
export type RuleAction = {type: string; [key: string]: unknown};
const fields: Record<string, string> = {
  hunt:'id quest',stop:'',rest:'',loot:'uids',travel:'to hunt quest',accept:'id',turnin:'id choice',abandon:'id',
  navigateQuest:'id',useQuestItem:'id',questScene:'id key',gather:'id',
  settings:'autoLoot autoLootIgnoreGray health mana',
  equip:'uid target slot',equipBag:'uid',train:'id',talent:'id target',resetTalents:'',
  buy:'id count',sell:'uid',sellBatch:'uids',sellJunk:'',sortBag:'',discardJunk:'',discardItem:'uid count',lockItem:'uid locked',
  auctionBuy:'id count',auctionSell:'uid',auctionSellBatch:'uids',auctionSellAll:'',auctionCancel:'id',
  sortBank:'',expandBank:'',bankDepositMaterials:'',bankDeposit:'uid count',bankWithdraw:'uid count',
  learnProfession:'id',upgradeProfession:'id',specializeProfession:'id',buyMaterials:'id count',
  disenchant:'uid',disenchantAll:'',applyEnchant:'id uid',useBandage:'id',
  bindHearth:'',useHearth:'',useItem:'uid slot',unlockFlight:'',fly:'to',trainRiding:'',buyMount:'id',mount:'id',dismount:'',
  conjure:'water',cast:'id target',petCommand:'command targetId itemId spellId',usePortal:'id',revive:'',resurrect:'target',reincarnate:'',soulstoneRevive:'',
  npcMatchSupply:'dungeonId minimumLevel maximumLevel unavailableIds',npcVisit:'',npcRefresh:'',npcFriend:'id friend',npcGroup:'memberIds',npcRecommend:'keep',npcLootPolicy:'auto',
  enterDungeon:'contentId',resetDungeon:'contentId',leaveDungeon:'',dungeonNext:'',dungeonNavigate:'destination',dungeonPause:'',dungeonInteract:'',dungeonSkip:'',
  partyBuffs:'',groupLoot:'id choice',abandonCombat:'encounterId',stockadesQuestStart:'questId',stockadesQuestCancel:'',escortStart:'',escortCancel:'',
  goldRules:'rules',goldPublish:'',goldInvite:'id',goldRecommend:'priority composition',goldLaunch:'',goldTactics:'patch',
  goldRecover:'',goldStart:'destination bossId',goldNavigate:'destination bossId',goldPause:'',goldSettle:'',goldLeave:'',
  raidPlan:'bossId plan',raidOrder:'order encounterId',
  goldBid:'lotId amount recipient quotedMinimum',goldBidLimit:'lotId amount',goldPass:'lotId',goldAuctionStep:'lotId',
  strategy:'target operation name overwrite rules policy autoBuffs potions preset',
  combatCommand:'order encounterId memberId memberIds destination targetId spellId enabled mode mark',
};
const unsafe=new Set(['__proto__','constructor','prototype']);
export function validateRuleAction(action: RuleAction) {
  if(!action||typeof action!=='object'||Array.isArray(action)||typeof action.type!=='string'||!Object.hasOwn(fields,action.type))throw new Error('Unsupported game action');
  const allowed=new Set(['type',...fields[action.type].split(' ').filter(Boolean)]);
  if(Object.keys(action).some(key=>!allowed.has(key)))throw new Error('Invalid game action fields');
  let size=0;
  const visit=(value:unknown,depth=0)=>{
    if(depth>10||++size>2048)throw new Error('Game action too complex');
    if(value===null||typeof value==='boolean')return;
    if(typeof value==='number'&&Number.isFinite(value))return;
    if(typeof value==='string'&&value.length<=2048)return;
    if(Array.isArray(value)){if(value.length>256)throw new Error('Game action too large');for(const item of value)visit(item,depth+1);return;}
    if(value&&typeof value==='object'){
      for(const [key,item] of Object.entries(value)){if(unsafe.has(key)||key.length>200)throw new Error('Invalid game action key');visit(item,depth+1);}return;
    }
    throw new Error('Invalid game action value');
  };
  visit(action);
  if(JSON.stringify(action).length>16_384)throw new Error('Game action too large');
}
