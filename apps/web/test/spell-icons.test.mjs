import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {icon,spells} from '../../../packages/game-domain/src/rules/catalog.js';
import {playerBuffs,battlePresentation} from '../../../packages/game-domain/src/rules/battle-presentation.js';
import {hudBuffs} from '../lib/player-buffs.js';
import spellIcons from '../../../packages/game-data/data/spell-icon-map.json' with {type:'json'};

test('effect spells resolve their own DBC icons even without a trainer icon entry',()=>{
 for(const [id,name] of [[16870,'spell_shadow_manaburn'],[12536,'spell_shadow_manaburn'],[6150,'ability_warrior_innerrage'],[12484,'spell_frost_icestorm'],[430,'inv_drink_07'],[2367,'inv_potion_58']]){
  assert.match(icon('spells',id),new RegExp(`/${name}\\.(png|jpg)$`),spells[id].SpellName);
 }
 assert.equal(icon('spells',-1),null);
});

test('every indexed DBC icon resolves to a shipped local asset',()=>{
 for(const path of Object.values(spellIcons.icons))assert.ok(existsSync(new URL(`../public/icons/${path}`,import.meta.url)),path);
 for(const spell of Object.values(spells)){
  const path=icon('spells',spell.Id);
  assert.ok(path,`${spell.Id}: ${spell.SpellName}`);
  assert.ok(existsSync(new URL(`../public${path}`,import.meta.url)),path);
 }
});

test('HUD and battle presentation retain triggered buff and custom consumable icons',()=>{
 const actor={id:'player',clock:1000,classId:8,hp:100,stats:{maxHp:100,maxMana:100},talentBuffs:[{spell:12536,until:10000}]};
 const buffs=hudBuffs(actor,{playerBuffs:playerBuffs(actor)});
 assert.equal(buffs.find(b=>b.spellId===12536)?.icon,icon('spells',12536));
 const battle=battlePresentation({...actor,lastCombat:{endedAt:1000,actorsSnapshot:[{...actor,auras:[{spell:992100,until:10000}]}],enemies:[]}});
 assert.equal(battle.units.player.effects.find(b=>b.spellId===12536)?.icon,icon('spells',12536));
 const elixir=battle.units.player.effects.find(b=>b.spellId===992100);
 assert.ok(existsSync(new URL(`../public${elixir.icon}`,import.meta.url)));
});
