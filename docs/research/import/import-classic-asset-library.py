"""Collect reference assets; never change gameplay mappings or existing asset bytes.

Requires Pillow. Run --verify for a completely offline integrity/decode check.
The checked-in scope, source trees/pages and manifest make the selection auditable.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
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
OUT = Path(__file__).with_name('classic-asset-library')
PUBLIC = ROOT / 'apps/web/public'
SOURCES = OUT / 'sources'
MANIFEST = OUT / 'manifest.json'
VANILLA = Path(__file__).with_name('combat-sounds') / 'vanilla-sound-paths.csv'
SOUND_PATTERN = r'\{"id":\d+,"title":"[^"]+","url":"[^"]+","type":"(?:\\.|[^"])*"\}'
EXPECTED_HASHES = {}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')


def fetch(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def cached(path, url):
    if path.exists():
        raw = path.read_bytes()
        expected = EXPECTED_HASHES.get(path.resolve())
        if expected and sha(raw) != expected:
            raise ValueError(f'Previously catalogued bytes changed: {path}')
        return raw
    raw = fetch(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return raw


def image_info(raw):
    with Image.open(io.BytesIO(raw)) as im:
        im.verify()
    with Image.open(io.BytesIO(raw)) as im:
        im.load()
        if im.format not in ('PNG', 'JPEG'):
            raise ValueError('Not a PNG/JPEG')
        return {'width': im.width, 'height': im.height, 'format': im.format}


def audio_info(raw):
    """Validate every Ogg page checksum, sequence and the Vorbis identification header."""
    pos = granule = sequence = 0
    serial = None
    while pos < len(raw):
        if raw[pos:pos + 4] != b'OggS' or pos + 27 > len(raw) or raw[pos + 4] != 0:
            raise ValueError('Invalid Ogg page')
        count = raw[pos + 26]
        table = raw[pos + 27:pos + 27 + count]
        end = pos + 27 + count + sum(table)
        if len(table) != count or end > len(raw):
            raise ValueError('Truncated Ogg page')
        page = bytearray(raw[pos:end])
        expected_crc = struct.unpack_from('<I', page, 22)[0]
        page[22:26] = b'\0' * 4
        crc = 0
        for byte in page:
            crc = ((crc << 8) & 0xffffffff) ^ CRC_TABLE[(crc >> 24) ^ byte]
        if crc != expected_crc:
            raise ValueError('Ogg CRC mismatch')
        page_serial, page_sequence = struct.unpack_from('<II', raw, pos + 14)
        if sequence == 0:
            serial = page_serial
            if not raw[pos + 5] & 2:
                raise ValueError('Missing Ogg BOS')
        if serial != page_serial or sequence != page_sequence:
            raise ValueError('Unexpected Ogg stream/sequence')
        value = struct.unpack_from('<Q', raw, pos + 6)[0]
        if value != 0xffffffffffffffff:
            granule = max(value, granule)
        flags = raw[pos + 5]
        sequence += 1
        pos = end
    if not sequence or not flags & 4:
        raise ValueError('Missing Ogg EOS')
    header = raw.index(b'\x01vorbis')
    channels = raw[header + 11]
    rate = struct.unpack_from('<I', raw, header + 12)[0]
    if not channels or not rate or not granule:
        raise ValueError('Empty Vorbis stream')
    return {'codec': 'vorbis', 'channels': channels, 'sampleRateHz': rate,
            'durationSeconds': round(granule / rate, 4), 'oggPages': sequence}


CRC_TABLE = []
for value in range(256):
    crc = value << 24
    for _ in range(8):
        crc = ((crc << 1) ^ (0x04c11db7 if crc & 0x80000000 else 0)) & 0xffffffff
    CRC_TABLE.append(crc)


def parallel(function, rows):
    with ThreadPoolExecutor(max_workers=4) as pool:
        return list(pool.map(function, rows))


def write_catalog(manifest):
    lines = ['# Classic 素材索引', '', '由 manifest.json 生成；文件位于 apps/web/public，尚未自动接入游戏页面。', '']
    groups = [('maps', '地图', '区域 / Zone ID'), ('sounds', '音效', '原始名称 / 关联技能 / 来源语言路径'),
              ('icons', '图标', '原始资源路径'), ('interface', '界面纹理候选', '原始资源路径')]
    for category, title, label in groups:
        lines.extend([f'## {title}', '', f'| {label} | 尺寸 / 时长 | 文件 |', '|---|---|---|'])
        for asset in manifest['assets']:
            if asset['category'] != category:
                continue
            description = asset.get('sourcePath', asset['id'])
            detail = f"{asset.get('width')} × {asset.get('height')}"
            if category == 'maps':
                description = f"{asset['nameZhCN']} / {asset['zoneId']}"
            elif category == 'sounds':
                description = f"{asset['title']} / {', '.join(map(str, asset['relatedSpellIds']))} / {asset['sourceLocale']}"
                detail = f"{asset['durationSeconds']} 秒"
            link = f"[{asset['path']}](../../../../apps/web/public/{quote(asset['path'])})"
            lines.append(f'| {description} | {detail} | {link} |')
        lines.append('')
    lines.extend(['声音关联技能并非运行时播放规则；界面纹理未逐张认证为 1.12 版本。版本边界、临时头像与缺口见 [README](README.md)。', ''])
    (OUT / 'CATALOG.md').write_text('\n'.join(lines), encoding='utf8', newline='\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.verify:
        verify()
        return
    if MANIFEST.exists():
        previous = read_json(MANIFEST)
        EXPECTED_HASHES.update({(PUBLIC / r['path']).resolve(): r['sha256'] for r in previous['assets']})
        EXPECTED_HASHES.update({(ROOT / r['path']).resolve(): r['sha256'] for r in previous['evidence']
                               if '/sources/' in r['path']})
    SOURCES.mkdir(parents=True, exist_ok=True)
    scope = read_json(OUT / 'scope.json')
    revision = scope['textureRevision']
    base = f'https://api.github.com/repos/Gethe/wow-ui-textures/git/trees/{revision}'
    tree = json.loads(cached(SOURCES / 'texture-root.json', base))
    if tree['sha'] != revision or tree.get('truncated'):
        raise ValueError('Invalid pinned root tree')
    directories = {e['path']: e for e in tree['tree']}
    missing, assets, jobs = list(scope.get('deferred', [])), [], []
    for folder, selected in [('ICONS', [n + '.png' for n in scope['iconNames']]), *scope['interfaceFiles'].items()]:
        source = SOURCES / f'textures-{folder}.json'
        entries = json.loads(cached(source, directories[folder]['url'] + '?recursive=1'))
        if entries.get('truncated') or entries['sha'] != directories[folder]['sha']:
            raise ValueError(f'Incomplete or wrong tree: {folder}')
        paths = {r['path'].lower(): r for r in entries['tree'] if r['type'] == 'blob'}
        for name in selected:
            row = paths.get(name.lower())
            if not row:
                missing.append({'category': 'icons' if folder == 'ICONS' else 'interface', 'id': name, 'reason': 'absent from pinned texture tree'})
                continue
            path = f'icons/assets/{name.lower()}' if folder == 'ICONS' else f'interface/classic/{folder.lower()}/{name.lower()}'
            jobs.append((folder, row, path))

    def texture(job):
        folder, row, path = job
        source_path = folder + '/' + row['path']
        url = f'https://raw.githubusercontent.com/Gethe/wow-ui-textures/{revision}/' + quote(source_path)
        raw = cached(PUBLIC / path, url)
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if blob != row['sha']:
            raise ValueError(f'Pinned Git blob mismatch: {path}; refusing to overwrite')
        return {'category': 'icons' if folder == 'ICONS' else 'interface', 'id': source_path.lower(),
                'path': path, 'url': url, 'sourcePath': source_path, 'gitBlobSha1': blob,
                'sha256': sha(raw), 'bytes': len(raw), 'transformation': 'none', **image_info(raw)}

    assets.extend(parallel(texture, jobs))
    print(f'Validated {len(assets)} pinned textures', flush=True)

    def zone(row):
        path = f'maps/{row["id"]}-classic.jpg'
        url = f'https://wow.zamimg.com/images/wow/classic/maps/enus/original/{row["zoneId"]}.jpg'
        raw = cached(PUBLIC / path, url)
        info = image_info(raw)
        if info['width'] < 900 or info['height'] < 500:
            raise ValueError(f'Unexpected map dimensions: {path}')
        return {'category': 'maps', **row, 'path': path, 'url': url,
                'sourcePage': f'https://www.wowhead.com/classic/zone={row["zoneId"]}',
                'language': 'enUS', 'sha256': sha(raw), 'bytes': len(raw),
                'transformation': 'none', **info}

    assets.extend(parallel(zone, scope['maps']))
    print(f'Validated {len(scope["maps"])} zone/city/battleground maps', flush=True)

    paths = VANILLA.read_text(encoding='utf-8-sig').splitlines()
    vanilla = {}
    for path in paths:
        vanilla.setdefault(path.rsplit('\\', 1)[-1].lower(), []).append(path)
    existing = {}
    for manifest in [ROOT / 'packages/game-data/data/world-assets-manifest.json', Path(__file__).with_name('combat-sounds') / 'manifest.json']:
        for row in read_json(manifest)['sounds']:
            existing[row['fileDataId']] = row['path']

    def spell_page(spell):
        page = SOURCES / f'spell-{spell}.html'
        raw = cached(page, f'https://www.wowhead.com/classic/spell={spell}')
        records = [json.loads(m.group()) for m in re.finditer(SOUND_PATTERN, raw.decode('utf8'))]
        if not records:
            raise ValueError(f'No sound records; inspect spell page {spell}')
        return spell, records

    sounds = {}
    for spell, records in parallel(spell_page, scope['soundSpellIds']):
        for record in records:
            matches = vanilla.get(record['title'].lower() + '.wav', [])
            if len(matches) != 1:
                missing.append({'category': 'sounds', 'spellId': spell, 'fileDataId': record['id'],
                                'title': record['title'], 'reason': 'no unique Vanilla WAV path match'})
                continue
            row = sounds.setdefault(record['id'], {**record, 'vanillaPath': matches[0], 'relatedSpellIds': [], 'sourceRecords': []})
            row['relatedSpellIds'].append(spell)
            row['sourceRecords'].append({'spellId': spell, 'url': record['url']})

    def sound(row):
        path = existing.get(row['id'], f'sounds/classic/{row["id"]}-{row["title"].lower()}.ogg')
        if not re.fullmatch(r'[a-z0-9/_ .-]+', path):
            raise ValueError(f'Unsafe sound filename: {path}')
        raw = cached(PUBLIC / path, row['url'])
        return {'category': 'sounds', 'id': str(row['id']), 'fileDataId': row['id'], 'title': row['title'],
                'path': path, 'url': row['url'], 'sourceLocale': row['url'].split('/classic/')[1].split('/')[0], 'vanillaPath': row['vanillaPath'],
                'relatedSpellIds': sorted(set(row['relatedSpellIds'])), 'sourceRecords': row['sourceRecords'], 'sha256': sha(raw),
                'bytes': len(raw), 'transformation': 'none', **audio_info(raw)}

    assets.extend(parallel(sound, sorted(sounds.values(), key=lambda r: r['id'])))
    evidence = [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p.read_bytes())}
                for p in [OUT / 'scope.json', VANILLA, *sorted(SOURCES.iterdir())] if p.is_file()]
    result = {'schemaVersion': 1, 'retrievedAt': '2026-09-16', 'status': 'reference-library; not automatically wired to gameplay',
              'textureRevision': revision, 'soundListRevision': 'c29b446631c5add9334dbf2376843bde30b66c1f',
              'versionCaveat': 'Pinned 2019 prelaunch Classic PNG mirror, not original BLP bytes. Selected UI textures are candidates, not individually certified 1.12 assets. Classic-served maps/audio are not byte-certified against a historical launch client. Sound filename membership is verified against Vanilla 1.12.1.5875.',
              'copyright': 'Original game art/audio belongs to Blizzard Entertainment; mirror code licenses do not relicense game assets.',
              'evidence': evidence, 'assets': assets, 'missing': missing}
    write_json(MANIFEST, result)
    verify()
    write_catalog(result)


def verify():
    manifest = read_json(MANIFEST)
    for evidence in manifest['evidence']:
        if sha((ROOT / evidence['path']).read_bytes()) != evidence['sha256']:
            raise ValueError(f'Evidence changed: {evidence["path"]}')
    paths = set()
    scope = read_json(OUT / 'scope.json')
    by_category = {c: [a for a in manifest['assets'] if a['category'] == c]
                   for c in ['icons', 'interface', 'maps', 'sounds']}
    expected_icons = {f'icons/{n}.png' for n in scope['iconNames']}
    absent_icons = {'icons/' + r['id'] for r in manifest['missing'] if r['category'] == 'icons'}
    if {a['id'] for a in by_category['icons']} | absent_icons != expected_icons:
        raise ValueError('Icon scope is incomplete')
    expected_ui = {f'{folder}/{name}'.lower() for folder, names in scope['interfaceFiles'].items() for name in names}
    if {a['id'] for a in by_category['interface']} != expected_ui:
        raise ValueError('Interface scope is incomplete')
    if {a['zoneId'] for a in by_category['maps']} != {r['zoneId'] for r in scope['maps']}:
        raise ValueError('Map scope is incomplete')
    if {s for a in by_category['sounds'] for s in a['relatedSpellIds']} != set(scope['soundSpellIds']):
        raise ValueError('Sound spell scope is incomplete')
    vanilla = set(VANILLA.read_text(encoding='utf-8-sig').splitlines())
    for asset in manifest['assets']:
        path = asset['path']
        if path in paths or not (PUBLIC / path).resolve().is_relative_to(PUBLIC.resolve()):
            raise ValueError(f'Duplicate or unsafe path: {path}')
        paths.add(path)
        raw = (PUBLIC / path).read_bytes()
        if sha(raw) != asset['sha256'] or len(raw) != asset['bytes']:
            raise ValueError(f'File mismatch: {path}')
        info = audio_info(raw) if asset['category'] == 'sounds' else image_info(raw)
        if any(asset[k] != v for k, v in info.items()):
            raise ValueError(f'Media metadata mismatch: {path}')
        if asset['category'] == 'sounds':
            if asset['vanillaPath'] not in vanilla:
                raise ValueError(f'Not in Vanilla path list: {path}')
            if asset['url'] not in [r['url'] for r in asset['sourceRecords']]:
                raise ValueError(f'Unproven download URL: {path}')
            if asset['relatedSpellIds'] != sorted({r['spellId'] for r in asset['sourceRecords']}):
                raise ValueError(f'Sound associations do not match evidence: {path}')
            for source_record in asset['sourceRecords']:
                spell = source_record['spellId']
                page = (SOURCES / f'spell-{spell}.html').read_text(encoding='utf8')
                records = [json.loads(m.group()) for m in re.finditer(SOUND_PATTERN, page)]
                if not any(r['id'] == asset['fileDataId'] and r['url'] == source_record['url'] and r['title'] == asset['title'] for r in records):
                    raise ValueError(f'Sound URL/ID not in source page: {path}, spell {spell}')
        if 'gitBlobSha1' in asset:
            folder, name = asset['sourcePath'].split('/', 1)
            tree = read_json(SOURCES / f'textures-{folder}.json')
            source = next(r for r in tree['tree'] if r['path'] == name)
            blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
            if blob != asset['gitBlobSha1'] or blob != source['sha']:
                raise ValueError(f'Git blob mismatch: {path}')
    print(json.dumps({'verified': len(paths), 'bytes': sum(a['bytes'] for a in manifest['assets']),
                      'categories': {c: sum(a['category'] == c for a in manifest['assets']) for c in ['icons', 'interface', 'maps', 'sounds']},
                      'missing': len(manifest['missing'])}), flush=True)


if __name__ == '__main__':
    main()
