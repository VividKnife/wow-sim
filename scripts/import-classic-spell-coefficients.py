"""Extract reviewed per-rank Classic coefficients; never execute Go source."""
import hashlib
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '7779ebbf79dc7f1341e6ab939b28a3402c9a730a'
# file, spell-id array, direct coefficient, per-tick coefficient.
# Numeric constants are reviewed literals from the same file; named values are
# extracted and fail closed if upstream syntax no longer matches.
SPECS = [
 ('mage/fireball','FireballSpellId','FireballSpellCoeff',0),
 ('mage/frostbolt','FrostboltSpellId','FrostboltSpellCoeff',0),
 ('mage/fire_blast','FireBlastSpellId','FireBlastSpellCoeff',0),
 ('mage/arcane_explosion','ArcaneExplosionSpellId','ArcaneExplosionSpellCoeff',0),
 ('mage/arcane_missiles','ArcaneMissilesSpellId','ArcaneMissilesSpellCoeff','ArcaneMissilesSpellCoeff'),
 ('mage/flamestrike','FlamestrikeSpellId','FlamestrikeSpellCoeff','FlamestrikeDotCoeff'),
 ('mage/blizzard','BlizzardSpellId',0,'spellCoeff'),
 ('mage/scorch','ScorchSpellId','spellCoeff',0),
 ('mage/pyroblast','PyroblastSpellId','spellCoeff','dotCoeff'),
 ('mage/blast_wave','BlastWaveSpellId','spellCoeff',0),
 ('warlock/immolate','spellId','directCoeff','dotCoeff'),
 ('warlock/corruption','spellId',0,'dotTickCoeff'),
 ('warlock/shadowbolt','spellId','spellCoeff',0),
 ('warlock/curses','spellId',0,'spellCoeff'),
 ('warlock/drain_life','spellId',0,'spellCoeff'),
 ('warlock/drain_soul','spellId',0,'spellCoeff'),
 ('warlock/rain_of_fire','spellId',0,'spellCoeff'),
 ('warlock/siphon_life','spellId',0,'spellCoeff'),
 ('warlock/death_coil','spellId','spellCoeff',0),
 ('warlock/searing_pain','spellId','spellCoeff',0),
 ('warlock/soul_fire','spellId','spellCoeff',0),
 ('warlock/shadowburn','spellId','spellCoeff',0),
 ('warlock/conflagrate','spellId','spCoeff',0),
 ('priest/smite','SmiteSpellId','SmiteSpellCoef',0),
 ('priest/mind_blast','MindBlastSpellId','MindBlastSpellCoef',0),
 ('priest/mind_flay','MindFlaySpellId',0,'spellCoeff'),
 ('priest/shadow_word_pain','ShadowWordPainSpellId',0,'ShadowWordPainSpellCoef'),
 ('priest/holy_fire','HolyFireSpellId','directCoeff','dotCoeff'),
 ('priest/devouring_plague','DevouringPlagueSpellId',0,'spellCoeff'),
 ('priest/starshards','StarshardsSpellId',0,'spellCoeff'),
 ('shaman/lightning_bolt','LightningBoltSpellId','LightningBoltSpellCoef',0),
 ('shaman/chain_lightning','ChainLightningSpellId','ChainLightningSpellCoef',0),
 ('shaman/earth_shock','EarthShockSpellId','EarthShockSpellCoef',0),
 ('shaman/frost_shock','FrostShockSpellId','FrostShockSpellCoef',0),
 ('shaman/flame_shock','FlameShockSpellId','FlameShockBaseSpellCoef','FlameShockDotSpellCoef'),
 ('shaman/lightning_shield','LightningShieldProcSpellId','LightningShieldSpellCoef',0),
 ('shaman/fire_totems','SearingTotemAttackSpellId','SearingTotemSpellCoef',0),
 ('shaman/fire_totems','MagmaTotemAoeSpellId','MagmaTotemSpellCoeff','MagmaTotemSpellCoeff'),
 ('shaman/fire_totems','FireNovaTotemAoeSpellId','FireNovaTotemSpellCoeff',0),
 ('druid/wrath','WrathSpellId','WrathSpellCoeff',0),
 ('druid/starfire','StarfireSpellId',1,0),
 ('druid/moonfire','MoonfireSpellId','MoonfiresSpellCoeff','MoonfiresSellDotCoeff'),
]

def value(text, name):
    if isinstance(name, (int, float)):
        return name
    array = re.search(r'\b'+re.escape(name)+r'\s*(?::=|=)\s*\[[^\]]+\](?:int32|float64)\{([\d.,\s]+)\}', text)
    if array:
        return [float(v) for v in array[1].split(',') if v.strip()]
    scalar = re.search(r'\b'+re.escape(name)+r'\s*:=\s*([\d.]+)\s*(?://[^\n]*)?\n', text)
    if scalar:
        return float(scalar[1])
    raise ValueError('Unsupported coefficient declaration: '+name)

rows, sources = {}, {}
for file, id_name, direct, dot in SPECS:
    path = 'sim/'+file+'.go'
    url = f'https://raw.githubusercontent.com/wowsims/classic/{COMMIT}/{path}'
    cached = ROOT/'.cache/raid-calibration/wowsims'/path
    if not cached.exists():
        cached.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, cached)
    text = cached.read_text()
    sources[file] = {'url': url, 'sha256': hashlib.sha256(cached.read_bytes()).hexdigest()}
    ids, direct, dot = value(text, id_name), value(text, direct), value(text, dot)
    for values in [direct, dot]:
        assert not isinstance(values, list) or len(values) == len(ids), file
    for rank, entry in enumerate(ids):
        if not entry:
            continue
        row = {'direct': direct[rank] if isinstance(direct, list) else direct,
               'periodic': dot[rank] if isinstance(dot, list) else dot, 'source': file,
               'binary': True if 'SpellFlagBinary' in text else None, 'pureDot': 'SpellFlagPureDot' in text}
        assert str(int(entry)) not in rows
        rows[str(int(entry))] = row
result = {'sourceCommit': COMMIT, 'status': 'Classic community simulation reference; per-rank values already include low-level penalties',
          'sources': sources, 'spells': dict(sorted(rows.items(), key=lambda p: int(p[0])))}
(ROOT/'packages/game-data/data/classic-spell-coefficients.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'))+'\n')
print(f'{len(rows)} spell ranks from {len(sources)} pinned source files')
