"""Import collected Classic model portraits and verify their identity evidence.

--from-directory accepts the collector output once; --verify is fully offline.
Evidence HTML is losslessly gzipped; game images retain their original bytes.
This collection does not replace the current runtime family/type fallback icons.
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).with_name('creature-portraits')
PUBLIC = ROOT / 'apps/web/public'
CATALOG = ROOT / 'packages/game-data/data/creature-portraits-manifest.json'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf8'))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')


def import_assets(source):
    source_manifest = read(source / 'creature-portraits-manifest.json')
    (OUT / 'sources/pages').mkdir(parents=True, exist_ok=True)
    (OUT / 'sources/metadata').mkdir(parents=True, exist_ok=True)
    (PUBLIC / 'creatures/portraits').mkdir(parents=True, exist_ok=True)
    evidence = []

    def preserve(relative, compress=False):
        raw = (source / relative).read_bytes()
        path = OUT / 'sources' / (relative + ('.gz' if compress else ''))
        path.parent.mkdir(parents=True, exist_ok=True)
        stored = gzip.compress(raw, mtime=0) if compress else raw
        path.write_bytes(stored)
        record = {'path': path.relative_to(ROOT).as_posix(), 'sha256': sha(stored),
                  'encoding': 'gzip' if compress else 'identity', 'originalSha256': sha(raw)}
        evidence.append(record)
        return record['path']

    preserve('creature-portraits-manifest.json')
    preserve('scope.json')
    preserve('supplement-scope.json')
    js_path = preserve(source_manifest['urlConstructionEvidence']['localPath'])
    pinned_path = preserve('metadata/pinned-reference-evidence.json')
    failure_path = preserve('supplement/page-failures.json')
    assets = []
    for asset in source_manifest['assets']:
        raw = (source / asset['path']).read_bytes()
        if sha(raw) != asset['sha256']:
            raise ValueError(f'Collector asset hash mismatch: {asset["path"]}')
        path = 'creatures/portraits/' + Path(asset['path']).name
        (PUBLIC / path).write_bytes(raw)
        assets.append({**asset, 'path': path})
    entries = {}
    for entry, record in source_manifest['entries'].items():
        row = dict(record)
        if row.get('pagePath'):
            page_raw = (source / row['pagePath']).read_bytes()
            if sha(page_raw) != row['pageSha256']:
                raise ValueError(f'Collector page hash mismatch: {entry}')
            row['pagePath'] = preserve(row['pagePath'], compress=True)
            row['pageEncoding'] = 'gzip'
            row['evidenceLevel'] = 'classic-npc-page-display-id'
        else:
            row['mappingEvidencePath'] = pinned_path
            row['evidenceLevel'] = 'pinned-local-model-id; Classic page unconfirmed'
        entries[entry] = row
    manifest = {**source_manifest, 'assets': assets, 'entries': entries, 'evidence': evidence,
                'status': 'collected model portrait library; runtime fallback icons unchanged',
                'pageFailuresPath': failure_path,
                'urlConstructionEvidence': {**source_manifest['urlConstructionEvidence'], 'localPath': js_path}}
    write(OUT / 'manifest.json', manifest)
    # Small display registry; evidence remains in docs instead of client payloads.
    registry = {'schemaVersion': 1, 'sourceManifest': 'docs/research/import/creature-portraits/manifest.json',
                'versionCaveat': source_manifest['limitation'],
                'assets': [{k: a[k] for k in ['id', 'displayId', 'kind', 'path', 'sha256', 'width', 'height']} for a in assets],
                'entries': {entry: {k: row[k] for k in ['entry', 'assetId', 'displayId', 'creatureType', 'family', 'evidenceLevel']}
                            for entry, row in entries.items()}}
    write(CATALOG, registry)
    verify()
    lines = ['# 怪物 2D 模型肖像目录', '', '300 × 300 透明 WebP。每个 NPC 仅收录一个明确选择的外观；未替换游戏中的类型图标。', '',
             '| NPC ID | 名称 | 预览 | 模型 ID | 映射证据 |', '|---:|---|---|---:|---|']
    indexed = {a['id']: a for a in assets}
    for entry, row in sorted(entries.items(), key=lambda pair: int(pair[0])):
        image = indexed[row['assetId']]
        level = 'Classic 页面' if row.get('pagePath') else '固定本地记录（页面未确认）'
        lines.append(f"| {entry} | {row['name']} | [查看图片](../../../../apps/web/public/{image['path']}) | {row['displayId']} | {level} |")
    (OUT / 'CATALOG.md').write_text('\n'.join(lines) + '\n', encoding='utf8', newline='\n')


def verify():
    manifest = read(OUT / 'manifest.json')
    for evidence in manifest['evidence']:
        raw = (ROOT / evidence['path']).read_bytes()
        if sha(raw) != evidence['sha256']:
            raise ValueError(f'Stored evidence mismatch: {evidence["path"]}')
        original = gzip.decompress(raw) if evidence['encoding'] == 'gzip' else raw
        if sha(original) != evidence['originalSha256']:
            raise ValueError('Decompressed evidence mismatch')
    assets = {a['id']: a for a in manifest['assets']}
    if len(assets) != len(manifest['assets']):
        raise ValueError('Duplicate asset identities')
    for asset in assets.values():
        raw = (PUBLIC / asset['path']).read_bytes()
        if sha(raw) != asset['sha256'] or len(raw) != asset['bytes']:
            raise ValueError(f'Portrait changed: {asset["path"]}')
        with Image.open(io.BytesIO(raw)) as im:
            im.load()
            if im.size != (asset['width'], asset['height']) or im.format != 'WEBP' or im.mode != 'RGBA':
                raise ValueError(f'Portrait format mismatch: {asset["path"]}')
        display = asset['displayId']
        if asset['url'] != f'https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/{display & 255}/{display}.webp':
            raise ValueError('Non-Classic/unexpected image URL')
    pinned = read(OUT / 'sources/metadata/pinned-reference-evidence.json')
    local_models = {}
    for source in pinned:
        raw = (ROOT / source['repositoryPath']).read_bytes()
        if sha(raw) != source['sha256']:
            raise ValueError(f'Pinned source content changed: {source["repositoryPath"]}')
        for row in source['rows']:
            decoded = dict(zip(source['columns'], row))
            local_models[str(decoded['Entry'])] = decoded['ModelId1']
    for entry, row in manifest['entries'].items():
        if assets[row['assetId']]['displayId'] != row['displayId']:
            raise ValueError(f'Asset identity mismatch: {entry}')
        if row.get('pagePath'):
            raw = gzip.decompress((ROOT / row['pagePath']).read_bytes())
            if sha(raw) != row['pageSha256']:
                raise ValueError(f'NPC page hash mismatch: {entry}')
            html = raw.decode('utf8')
            tags = re.findall(r'<[^>]*data-mv-display-id[^>]*>', html)
            if not any(re.search(r'data-mv-type-id=[\"\x27]' + re.escape(entry) + r'[\"\x27]', tag)
                       and re.search(r'data-mv-display-id=[\"\x27]' + str(row['displayId']) + r'[\"\x27]', tag) for tag in tags):
                raise ValueError(f'NPC/display identity not found on source page: {entry}')
        elif local_models.get(entry) != row['displayId']:
            raise ValueError(f'Local NPC/display identity mismatch: {entry}')
    registry = read(CATALOG)
    if set(registry['entries']) != set(manifest['entries']):
        raise ValueError('Registry scope differs from evidence')
    for entry, row in registry['entries'].items():
        if any(manifest['entries'][entry][k] != v for k, v in row.items()):
            raise ValueError(f'Registry identity mismatch: {entry}')
    for asset in registry['assets']:
        if any(assets[asset['id']][k] != v for k, v in asset.items()):
            raise ValueError('Registry asset differs from evidence')
    print(json.dumps({'verifiedPortraits': len(assets), 'npcMappings': len(registry['entries']),
                      'classicPageEvidence': sum(bool(r.get('pagePath')) for r in manifest['entries'].values()),
                      'pinnedLocalEvidence': sum(not r.get('pagePath') for r in manifest['entries'].values())}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-directory', type=Path)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.verify:
        verify()
    elif args.from_directory:
        import_assets(args.from_directory)
    else:
        parser.error('Choose --verify or --from-directory COLLECTOR_OUTPUT')
