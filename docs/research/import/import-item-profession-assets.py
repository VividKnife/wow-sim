"""Import source-backed display icons into the existing runtime icon map.

Requires Pillow. Scope export is explicit; --verify performs offline checks.
Only display mappings are written; source mechanics/name tables remain unchanged.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import time
from urllib.parse import quote
import urllib.request

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).with_name('item-profession-assets')
SOURCES = OUT / 'sources'
PUBLIC = ROOT / 'apps/web/public'
MAP = ROOT / 'packages/game-data/data/icon-map.json'
MANIFEST = OUT / 'manifest.json'
REVISION = '93b11b73ee4e483ce414f3d5f99a9047d23a9e48'
TEXTURE_REVISION = 'b852b560442b31579e77ef3967b3c2d594832da8'
TREE = Path(__file__).with_name('classic-asset-library') / 'sources/textures-ICONS.json'
DBC_HASHES = {
    'ItemDisplayInfo': '6f37ca862dc632a11aaf86e0ba7b183aa7abaebb052549e6120aa9fa69dd9dee',
    'SpellIcon': '938e8c333fe914938994fc331c04655d7eb5719bc2d1b29eaf5fad4239abdfdc',
    'Spell': 'be197208c231129d63854c33943953010c4977481870e88b3fcc58ea6e3ac930',
    'SkillLine': 'a861b8e02c70a15f3566f214780c1fb21af2d7ef76fd2dbf228185dfbc9b057c',
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf8'))


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')


def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'wow-sim-reference-import/1.0'}), timeout=40) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def dbc(name):
    # The large Spell table is reproducibly cached, not duplicated in Git.
    path = ROOT / '.cache/source-data/professions/Spell.dbc' if name == 'Spell' else SOURCES / (name + '.dbc')
    if not path.exists():
        cached = ROOT / '.cache/source-data/professions' / (name + '.dbc')
        raw = cached.read_bytes() if cached.exists() else fetch(f'https://raw.githubusercontent.com/soyalu/cmangos-classic-map/{REVISION}/dbc/{name}.dbc')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    raw = path.read_bytes()
    if sha(raw) != DBC_HASHES[name]:
        raise ValueError(f'{name}: unexpected source hash')
    magic, count, fields, size, string_size = struct.unpack_from('<4s4I', raw)
    if magic != b'WDBC' or size != fields * 4 or len(raw) != 20 + count * size + string_size:
        raise ValueError(f'{name}: invalid WDBC envelope')
    rows = [struct.unpack_from('<' + str(fields) + 'I', raw, 20 + i * size) for i in range(count)]
    return rows, raw[20 + count * size:]


def dbc_text(strings, offset):
    end = strings.find(b'\0', offset)
    if offset >= len(strings) or end < 0:
        raise ValueError('Invalid DBC string offset')
    return strings[offset:end].decode('utf8')


def image_info(raw):
    with Image.open(io.BytesIO(raw)) as image:
        image.verify()
    with Image.open(io.BytesIO(raw)) as image:
        image.load()
        if image.format not in ('PNG', 'JPEG'):
            raise ValueError('Unexpected image format')
        return {'width': image.width, 'height': image.height, 'format': image.format}


def write_catalog(scope, manifest):
    folder = OUT / 'catalog'
    folder.mkdir(exist_ok=True)
    class_names = {0: '消耗品', 1: '容器', 2: '武器', 3: '珠宝', 4: '护甲', 5: '施法材料',
                   6: '弹药', 7: '商品与制造材料', 8: '通用', 9: '配方物品', 10: '货币',
                   11: '箭袋与弹药袋', 12: '任务物品', 13: '钥匙', 14: '永久物品', 15: '杂项'}
    lines = ['# 物品、装备与生活技能图标目录', '', '范围是当前登记数据，不等同于全部物品可由玩家获取。NPC 专用、废弃与自定义物品保留其身份。', '',
             '| 物品分类 | 登记数 | 已映射 | 索引 |', '|---|---:|---:|---|']
    for item_class in sorted({r['itemClass'] for r in scope['items']}):
        rows = [r for r in scope['items'] if r['itemClass'] == item_class]
        matched = sum(str(r['id']) in manifest['mappings']['items'] for r in rows)
        title = class_names.get(item_class, str(item_class))
        filename = f'item-class-{item_class}.md'
        lines.append(f'| {title} | {len(rows)} | {matched} | [查看](catalog/{filename}) |')
        detail = [f'# {title}', '', '| ID | 来源名称 | 槽位类型 | 图标 | 依据 |', '|---:|---|---:|---|---|']
        for row in rows:
            mapping = manifest['mappings']['items'].get(str(row['id']))
            icon = f"[查看](../../../../../apps/web/public/{quote(mapping['path'])})" if mapping else '缺失'
            basis = '项目自定义物品' if mapping and mapping['basis'].startswith('adapted-item') else ('Classic tooltip' if mapping and mapping.get('sourceUrl') else '固定 DBC')
            name = row['name'].replace('|', '\\|')
            detail.append(f"| {row['id']} | {name} | {row['inventoryType']} | {icon} | {basis if mapping else '未确认'} |")
        (folder / filename).write_text('\n'.join(detail) + '\n', encoding='utf8', newline='\n')
    lines.extend(['', '## 12 项专业与生活技能', '', '| 专业 | SkillLine ID | 制造配方数 | 图标 |', '|---|---:|---:|---|'])
    for row in scope['professions']:
        mapping = manifest['mappings']['professions'][row['id']]
        count = sum(r['profession'] == row['id'] for r in scope['recipes'])
        lines.append(f"| {row['id']} | {row['skillId']} | {count} | [查看](../../../../apps/web/public/{quote(mapping['path'])}) |")
    lines.extend(['', f"[{len(scope['professionSpells']):,} 条配方、等级与专精技能图标](catalog/profession-spells.md)。采药、剥皮、钓鱼没有制造配方，不以零配方数视作遗漏。", '',
                  f"{len(scope['classSpells']):,} 个职业技能与 {len(scope['talents']):,} 个天赋节点均验证了现有本地图片；逐 ID 路径见 [manifest.json](manifest.json)。", '',
                  f"来源、{len(manifest['missing'])} 项缺失与自定义附魔卷轴说明见 [README](README.md)。", ''])
    (OUT / 'CATALOG.md').write_text('\n'.join(lines), encoding='utf8', newline='\n')
    detail = ['# 生活技能配方、等级与专精图标', '', '| 技能 ID | 来源名称 | 图标 |', '|---:|---|---|']
    for row in scope['professionSpells']:
        path = manifest['mappings']['spells'][str(row['id'])]['path']
        name = (row['name'] or '等级 / 专精').replace('|', '\\|')
        detail.append(f"| {row['id']} | {name} | [查看](../../../../../apps/web/public/{quote(path)}) |")
    (folder / 'profession-spells.md').write_text('\n'.join(detail) + '\n', encoding='utf8', newline='\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.verify:
        verify()
        return
    if MANIFEST.exists():
        for asset in read(MANIFEST)['assets']:
            path = PUBLIC / asset['path']
            if path.exists() and sha(path.read_bytes()) != asset['sha256']:
                raise ValueError(f'Previously recorded asset bytes changed: {path}')
    SOURCES.mkdir(parents=True, exist_ok=True)
    scope = read(OUT / 'scope.json')
    for path, expected in scope['sourceBundles'].items():
        if sha((ROOT / path).read_bytes()) != expected:
            raise ValueError(f'Scope source changed: {path}; inspect before explicitly re-exporting')
    display_rows, strings = dbc('ItemDisplayInfo')
    displays = {r[0]: dbc_text(strings, r[5]).lower() for r in display_rows}
    spell_rows, _ = dbc('Spell')
    spells = {r[0]: r for r in spell_rows}
    icon_rows, strings = dbc('SpellIcon')
    spell_icons = {r[0]: dbc_text(strings, r[1]).replace('\\', '/').rsplit('/', 1)[-1].lower() for r in icon_rows}
    skill_rows, _ = dbc('SkillLine')
    skill_icons = {r[0]: r[21] for r in skill_rows}
    tree = {r['path'].lower()[:-4]: r for r in read(TREE)['tree'] if r['type'] == 'blob'}
    missing, mappings = [], {k: {} for k in ['items', 'spells', 'professions', 'talents']}
    assets_needed = set()

    def assign(kind, identity, icon_name, evidence, existing=None):
        if existing:
            path = existing.lstrip('/')
        elif icon_name in tree:
            path = 'icons/assets/' + icon_name + '.png'
        else:
            missing.append({'kind': kind, 'id': identity, 'icon': icon_name, 'reason': 'No verified texture in pinned snapshot', **evidence})
            return
        if path.startswith('icons/assets/'):
            assets_needed.add(Path(path).stem)
        mappings[kind][str(identity)] = {'path': path, 'iconName': icon_name, **evidence}

    selected_spell_rows = {}
    for row in scope['professionSpells'] + scope['classSpells']:
        source = spells[row['id']]
        if row['iconId'] and row['iconId'] != source[117]:
            raise ValueError(f'SQL/DBC spell icon mismatch: {row["id"]}')
        selected_spell_rows[str(row['id'])] = {'id': row['id'], 'spellIconId': source[117], 'record': list(source)}
        assign('spells', row['id'], spell_icons.get(source[117]), {'basis': 'Spell.dbc → SpellIcon.dbc', 'spellIconId': source[117]}, row['existingIcon'])
    write(SOURCES / 'selected-spell-records.json', {'sourceSha256': DBC_HASHES['Spell'], 'iconColumn': 117, 'records': selected_spell_rows})

    recipe_spells = {r['itemId']: r['spellId'] for r in scope['recipes']}
    for row in scope['items']:
        icon_name = displays.get(row['displayId'])
        evidence = {'basis': 'item_template.displayid → ItemDisplayInfo.dbc', 'displayId': row['displayId']}
        if not row['displayId'] and row['id'] in recipe_spells:
            sid = recipe_spells[row['id']]
            icon_name = spell_icons[spells[sid][117]]
            evidence = {'basis': 'adapted-item: project enchanting scroll uses its recipe spell icon', 'recipeSpellId': sid}
        elif icon_name not in tree:
            source = SOURCES / f'item-{row["id"]}.json'
            if source.exists() and (read(source).get('icon') or '').lower() in tree:
                icon_name = read(source)['icon'].lower()
                evidence = {'basis': 'Classic tooltip display identity only', 'sourceFile': source.relative_to(ROOT).as_posix(),
                            'sourceUrl': f'https://nether.wowhead.com/classic/tooltip/item/{row["id"]}?locale=0', 'displayId': row['displayId']}
        if row['existingIcon'] and Path(row['existingIcon']).stem != icon_name:
            raise ValueError(f'Existing item mapping conflicts with source: {row["id"]}')
        assign('items', row['id'], icon_name, evidence, row['existingIcon'])
    for row in scope['professions']:
        icon_id = skill_icons[row['skillId']]
        assign('professions', row['id'], spell_icons[icon_id], {'basis': 'SkillLine.dbc → SpellIcon.dbc', 'skillId': row['skillId'], 'spellIconId': icon_id})
    for row in scope['talents']:
        if not row['existingIcon']:
            raise ValueError(f'Existing talent icon missing: {row["id"]}')
        assign('talents', row['id'], Path(row['existingIcon']).stem, {'basis': 'existing pinned class/talent mapping'}, row['existingIcon'])

    def asset(name):
        row = tree[name]
        path = PUBLIC / 'icons/assets' / (name + '.png')
        url = f'https://raw.githubusercontent.com/Gethe/wow-ui-textures/{TEXTURE_REVISION}/ICONS/' + quote(row['path'])
        raw = path.read_bytes() if path.exists() else fetch(url)
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if blob != row['sha']:
            raise ValueError(f'Pinned texture mismatch: {name}')
        info = image_info(raw)
        if not path.exists():
            path.write_bytes(raw)
        return {'path': path.relative_to(PUBLIC).as_posix(), 'url': url, 'sourcePath': row['path'], 'gitBlobSha1': blob, 'sha256': sha(raw), 'bytes': len(raw), **info}

    assets = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        jobs = [pool.submit(asset, name) for name in sorted(assets_needed)]
        for future in as_completed(jobs):
            assets.append(future.result())
            if len(assets) % 200 == 0:
                print(f'Validated {len(assets)}/{len(jobs)} pinned PNGs', flush=True)
    # Existing CDN JPEG mappings remain unchanged and get a local integrity audit.
    other_paths = {r['path'] for rows in mappings.values() for r in rows.values()} - {a['path'] for a in assets}
    for path in sorted(other_paths):
        raw = (PUBLIC / path).read_bytes()
        assets.append({'path': path, 'basis': 'existing project asset; source remains in prior icon manifests', 'sha256': sha(raw), 'bytes': len(raw), **image_info(raw)})
    current = read(MAP)
    changes = {k: 0 for k in mappings}
    for kind, rows in mappings.items():
        target = current.setdefault(kind, {})
        for identity, row in rows.items():
            value = row['path'].removeprefix('icons/')
            # Existing secondary maps do not need duplicate class/talent entries.
            baseline = next((r['existingIcon'] for r in scope.get('classSpells' if kind == 'spells' else 'talents', []) if str(r['id']) == identity), None) if kind in ('spells', 'talents') else None
            if baseline and identity not in target:
                continue
            if target.get(identity) != value:
                changes[kind] += 1
                target[identity] = value
    write(MAP, current)
    evidence = [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p.read_bytes())}
                for p in [OUT / 'scope.json', TREE, *sorted(SOURCES.iterdir())] if p.is_file()]
    result = {'schemaVersion': 1, 'retrievedAt': '2026-09-16', 'status': 'display mappings integrated; no gameplay numeric changes',
              'dbcSource': {'repository': 'soyalu/cmangos-classic-map', 'revision': REVISION, 'sha256': DBC_HASHES, 'versionCaveat': 'Third-party Vanilla DBC mirror; exact client build unverified'},
              'textureRevision': TEXTURE_REVISION, 'textureCaveat': '2019 prelaunch Classic PNG mirror; not original BLP or launch-byte certification',
              'mappings': mappings, 'assets': sorted(assets, key=lambda a: a['path']), 'missing': missing, 'evidence': evidence}
    write(MANIFEST, result)
    print('Runtime mapping writes: ' + json.dumps(changes), flush=True)
    verify()
    write_catalog(scope, result)


def verify():
    manifest = read(MANIFEST)
    scope = read(OUT / 'scope.json')
    for e in manifest['evidence']:
        if sha((ROOT / e['path']).read_bytes()) != e['sha256']:
            raise ValueError(f'Evidence changed: {e["path"]}')
    for path, expected in scope['sourceBundles'].items():
        if sha((ROOT / path).read_bytes()) != expected:
            raise ValueError(f'Registered source content changed: {path}')
    texture_tree = {r['path']: r for r in read(TREE)['tree']}
    paths = set()
    for asset in manifest['assets']:
        path = asset['path']
        if path in paths or not (PUBLIC / path).resolve().is_relative_to(PUBLIC.resolve()):
            raise ValueError(f'Duplicate/unsafe path: {path}')
        paths.add(path)
        raw = (PUBLIC / path).read_bytes()
        if sha(raw) != asset['sha256'] or len(raw) != asset['bytes']:
            raise ValueError(f'Asset changed: {path}')
        if image_info(raw) != {k: asset[k] for k in ('width', 'height', 'format')}:
            raise ValueError(f'Image metadata mismatch: {path}')
        if 'gitBlobSha1' in asset:
            blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
            if blob != asset['gitBlobSha1'] or blob != texture_tree[asset['sourcePath']]['sha']:
                raise ValueError(f'Git blob mismatch: {path}')
    expected = {'items': {str(r['id']) for r in scope['items']},
                'spells': {str(r['id']) for r in scope['professionSpells'] + scope['classSpells']},
                'talents': {str(r['id']) for r in scope['talents']}, 'professions': {r['id'] for r in scope['professions']}}
    runtime = read(MAP)
    class_map = read(ROOT / 'packages/game-data/data/class-icon-map.json')
    journey = read(ROOT / 'packages/game-data/data/journey-item-assets.json')['items']
    for kind, ids in expected.items():
        missing = {str(r['id']) for r in manifest['missing'] if r['kind'] == kind}
        if set(manifest['mappings'][kind]) | missing != ids:
            raise ValueError(f'Incomplete {kind} coverage accounting')
        for identity, mapping in manifest['mappings'][kind].items():
            resolved = runtime.get(kind, {}).get(identity) or class_map.get(kind, {}).get(identity) or (journey.get(identity, {}).get('icon') if kind == 'items' else None)
            if mapping['path'] not in paths or 'icons/' + str(resolved) != mapping['path']:
                raise ValueError(f'Runtime mapping mismatch: {kind}/{identity}')
    print(json.dumps({'verifiedImages': len(paths), 'mappings': {k: len(v) for k, v in manifest['mappings'].items()}, 'missing': len(manifest['missing'])}), flush=True)


if __name__ == '__main__':
    main()
