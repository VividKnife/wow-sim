// Public display packs. The aggregate catalog remains server-side and is also
// useful for offline previews; no HTTP endpoint sends it wholesale.
export function contentPack(catalog, params) {
 const pack=params.get('pack')||'core';
 const version={contentVersion:catalog.contentVersion,pack};
 if(pack==='core') {
  const {items,market,dungeonJournal,...core}=catalog;
  return {...core,pack,items:{},market:[],dungeonJournal:(dungeonJournal||[]).map(d=>({...d,bosses:d.bosses.map(({loot,...boss})=>({...boss,contentVersion:catalog.contentVersion,lootPack:`boss:${d.id}:${boss.id}`}))}))};
 }
 if(pack==='items') {
  const raw=params.get('ids')||'';
  if(!/^[1-9]\d*(,[1-9]\d*)*$/.test(raw)||raw.split(',').length>200)throw Object.assign(new Error('物品请求无效'),{status:400});
  const ids=[...new Set(raw.split(',').map(Number))];
  if(ids.some(id=>!Number.isSafeInteger(id)))throw Object.assign(new Error('物品请求无效'),{status:400});
  return {...version,items:Object.fromEntries(ids.filter(id=>Object.hasOwn(catalog.items,id)).map(id=>[id,catalog.items[id]])),missing:ids.filter(id=>!Object.hasOwn(catalog.items,id))};
 }
 if(pack==='market')return {...version,market:catalog.market,items:Object.fromEntries(catalog.market.filter(row=>catalog.items[row.id]).map(row=>[row.id,catalog.items[row.id]]))};
 if(pack.startsWith('boss:')) {
  const [,dungeonId,bossId]=pack.split(':');
  const boss=catalog.dungeonJournal?.find(d=>d.id===dungeonId)?.bosses.find(b=>String(b.id)===bossId);
  if(boss&&pack===`boss:${dungeonId}:${boss.id}`)return {...version,loot:boss.loot};
 }
 throw Object.assign(new Error('内容包不存在'),{status:404});
}
