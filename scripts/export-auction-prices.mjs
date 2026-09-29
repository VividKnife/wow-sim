import {writeFile,readFile} from 'node:fs/promises';
import {marketView} from '../packages/game-domain/src/rules/market.js';
import {nameOf} from '../packages/game-domain/src/rules/catalog.js';
import {CURRENT_CONTENT_PHASE} from '../packages/game-domain/src/rules/content-phase.js';
import {marketReference} from '../packages/game-data/market-reference.js';
const money=n=>`${Math.floor(n/10000)}金${Math.floor(n%10000/100)}银${n%100}铜`;
const basis={reference:'同期记录参考',estimate:'品类估算',vendor:'商人单价',craft:'材料成本'};
const rows=marketView();
const output=`# 拍卖行价格目录\n\n生成自 \`${marketReference.version}\`，当前 P${CURRENT_CONTENT_PHASE}，共 ${rows.length} 件商品。所有金额均为每件价格，收购价为税前，实际按整组扣 5% 后向下取整。历史拍卖行不存在统一官方售价；证据、估算边界和补货规则见 [调研说明](auction-house.md)。\n\n更新：\`node scripts/export-auction-prices.mjs\`；验证：\`node scripts/export-auction-prices.mjs --check\`。\n\n| ID | 物品 | 分类 / 子分类 | 阶段 | 出售价 | 收购价 | 单件到账 | 库存上限 | 补货（分） | 定价依据 |\n|---|---|---|---|---|---|---|---:|---:|---|\n`+rows.map(r=>`| ${r.id} | ${nameOf('items',r.id).replaceAll('|','/')} | ${r.category} / ${r.subcategory}${r.slot?' / '+r.slot:''} | P${r.phase} | ${money(r.buy)} | ${money(r.sell)} | ${money(Math.floor(r.sell*.95))} | ${r.capacity} | ${r.restockMs/60000} | ${basis[r.basis]} |`).join('\n')+'\n';
const path=new URL('../docs/research/auction-price-catalog.md',import.meta.url);
if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==output)throw new Error('拍卖行价格目录过期，请重新生成');}
else await writeFile(path,output);
console.log(`Auction price catalog: ${rows.length} items${process.argv.includes('--check')?' verified':''}`);
