import tooltips from '../../../game-data/data/buff-tooltips-zhCN.json' with {type:'json'};

// Aura text is distinct from the spell's casting description. Keep source values,
// as the Classic tooltip does, rather than substituting an ambiguous runtime amount.
export function buffTooltip(spellId) {
 return tooltips.spells[spellId]||{};
}
