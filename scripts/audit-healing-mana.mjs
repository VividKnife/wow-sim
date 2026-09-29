// Run python3 scripts/audit-healing-mana.py first to parse the pinned SQL independently.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spells} from '../packages/game-domain/src/rules/catalog.js';
const source=JSON.parse(readFileSync('work/healing-mana-source.json','utf8'));
const mismatches=[];
for(const row of source.spells)for(const key of ['ManaCost','ManaCostPerlevel','ManaCostPercentage','PowerType'])if(spells[row.Id]?.[key]!==row[key])mismatches.push({id:row.Id,key,expected:row[key],actual:spells[row.Id]?.[key]});
const ids=[25314,10917,25315,10961,25292,19943,25357,10468,10623,25297,9858,25299];
const report={source:{commit:source.commit,sha256:source.sha256},checked:source.spells.length,mismatches,rows:ids.map(id=>({id,name:spells[id].SpellName,level:spells[id].SpellLevel,mana:spells[id].ManaCost}))};
writeFileSync('work/healing-mana-audit.json',JSON.stringify(report,null,2)+'\n');
assert.equal(mismatches.length,0,JSON.stringify(mismatches));console.log(`Verified ${report.checked} healing spell mana records; no mismatches.`);
