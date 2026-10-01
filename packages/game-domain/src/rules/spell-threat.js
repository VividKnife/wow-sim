import {table} from './catalog.js';

// Shared once per rules isolate. Attacks never scan the content table.
const flatBySpell=Object.fromEntries(table('spell_threat').map(row=>[row.entry,row.Threat]));
export const flatSpellThreat=spellId=>flatBySpell[spellId]??0;
