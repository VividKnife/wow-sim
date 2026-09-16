"""Import icons for all source-backed level 1-60 class abilities and talents.

Spell icon names come from the pinned SpellIcon.dbc reference. Talent icon
names come from the pinned 2019 talent archive already embedded in
classes-reference.json. Original CDN JPEG bytes are retained unchanged and a
URL/hash manifest is generated beside this script.
"""
from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
DATA = REPO / 'apps/web/data'
PUBLIC = REPO / 'apps/web/public/icons/class-assets'
CLASS_REFERENCE = DATA / 'classes-reference.json'
EXISTING_MAP = DATA / 'icon-map.json'
OUTPUT_MAP = DATA / 'class-icon-map.json'
MANIFEST = Path(__file__).with_name('class-icons-manifest.json')
TALENT_ARCHIVE = Path('C:/workspace/wow-sim-research/talents/archive-spells.json')
ASSET = 'https://wow.zamimg.com/images/wow/icons/large/{icon}.jpg'
USER_AGENT = 'wow-sim pinned-reference-importer/1.0'


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def main() -> None:
    bundle = json.loads(CLASS_REFERENCE.read_text(encoding='utf8'))
    existing = json.loads(EXISTING_MAP.read_text(encoding='utf8'))
    # Identity comes from the same pinned Classic client DBC mirror as the
    # mechanics lookups. No live tooltip can silently alter gameplay names.
    abilities = {a['spellId']: a for rows in bundle['classAbilities'].values() for a in rows
                 if str(a['spellId']) not in existing.get('spells', {})}
    for entry in bundle['classContentManifest']['entries']:
        if entry['contentRole'] == 'pet-ability' and str(entry['spellId']) not in existing.get('spells', {}):
            abilities[entry['spellId']] = entry
    talents = {t['id']: t for tree in bundle['classTalentTrees'] for t in tree['talents']
               if str(t['id']) not in existing.get('talents', {})}
    missing, spell_map, talent_map = [], {}, {}
    for sid, ability in sorted(abilities.items()):
        icon = bundle['classSpellIconNames'].get(str(sid), '')
        if not re.fullmatch(r'[a-z0-9_]+', icon):
            missing.append({'kind': 'spell', 'id': sid, 'name': ability['name'], 'reason': 'no pinned SpellIcon mapping'})
            continue
        spell_map[str(sid)] = f'class-assets/{icon}.jpg'
    for tid, talent in sorted(talents.items()):
        icon = (talent.get('icon') or bundle['classSpellIconNames'].get(str(talent['ranks'][0]), '')).lower()
        if not re.fullmatch(r'[a-z0-9_]+', icon):
            missing.append({'kind': 'talent', 'id': tid, 'name': talent['name'], 'reason': 'no pinned icon mapping'})
            continue
        talent_map[str(tid)] = f'class-assets/{icon}.jpg'

    icon_names = sorted({path.rsplit('/', 1)[1][:-4] for path in [*spell_map.values(), *talent_map.values()]})
    PUBLIC.mkdir(parents=True, exist_ok=True)

    def asset_record(icon: str) -> dict:
        url = ASSET.format(icon=icon)
        target = PUBLIC / f'{icon}.jpg'
        raw = target.read_bytes() if target.exists() else fetch(url)
        if not raw.startswith(b'\xff\xd8\xff'):
            raise ValueError(f'{url} did not return a JPEG')
        target = PUBLIC / f'{icon}.jpg'
        target.write_bytes(raw)
        return {'icon': icon, 'file': f'apps/web/public/icons/class-assets/{icon}.jpg',
                'sourceUrl': url, 'sha256': sha256(raw), 'bytes': len(raw)}

    with ThreadPoolExecutor(max_workers=8) as pool:
        assets = list(pool.map(asset_record, icon_names))

    archive_hash = sha256(TALENT_ARCHIVE.read_bytes())
    result = {
        'status': 'reference UI assets; gameplay identity remains pinned SQL/DBC data',
        'spells': spell_map, 'talents': talent_map, 'missing': missing,
    }
    manifest = {
        'status': 'original JPEG bytes retained without image editing',
        'assetTemplate': ASSET,
        'talentIconSource': {'path': str(TALENT_ARCHIVE), 'sha256': archive_hash,
                             'snapshot': '2019'},
        'spellIconSource': bundle['meta']['additionalDbcProvenance'],
        'spellMappings': [{'spellId': sid, 'name': row['name'], 'icon': bundle['classSpellIconNames'].get(str(sid))}
                          for sid, row in sorted(abilities.items())],
        'talentMappings': [
            {'talentId': talent_id, 'name': talent['name'], 'icon': talent.get('icon'),
             'rankSpellId': talent['ranks'][0] if talent['ranks'] else None}
            for talent_id, talent in sorted(talents.items())
        ],
        'assets': assets, 'missing': missing,
    }
    OUTPUT_MAP.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'spellIds': len(spell_map), 'talentIds': len(talent_map),
                      'uniqueAssets': len(assets), 'missing': missing}, indent=2))


if __name__ == '__main__':
    main()
