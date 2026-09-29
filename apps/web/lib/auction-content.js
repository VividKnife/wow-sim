// Reject stale server catalogs before phase filtering can turn them into an
// apparently empty auction house. Never infer a phase for incomplete records.
export function auctionContentError(data) {
 const valid=Array.isArray(data?.market)&&data.items&&data.market.every(row=>
  row&&Number.isSafeInteger(row.id)&&row.id>0&&data.items[row.id]&&
  Number.isInteger(row.phase)&&row.phase>=1&&row.phase<=6&&
  typeof row.category==='string'&&row.category.length>0&&
  typeof row.subcategory==='string'&&row.subcategory.length>0&&typeof row.slot==='string'&&
  ['buy','sell','capacity','restockMs'].every(key=>Number.isSafeInteger(row[key])&&row[key]>=0)&&row.restockMs>0
 );
 return valid?'':'拍卖行数据与当前客户端不一致，请更新游戏服务后刷新页面。';
}
