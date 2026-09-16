"""Import unchanged Classic audio, checking each filename against a pinned Vanilla list."""
import hashlib, json, pathlib, re, struct, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / 'docs/research/import/combat-sounds'
PUBLIC = ROOT / 'apps/web/public/sounds'
LIST = pathlib.Path('C:/workspace/wow-sim-research/world-assets/vanilla-sound-paths.csv')
SELECTION = {
    'melee-swing': (1752, 569828), 'heroic-impact': (78, 569098),
    'sinister-impact': (1752, 569227), 'heal-impact': (2050, 569570),
    'flash-heal-impact': (2061, 569419), 'renew': (139, 569376),
    'holy-cast': (585, 569763), 'holy-impact': (585, 569402),
    'shadow-cast': (686, 569766), 'shadow-impact': (686, 568670),
    'nature-cast': (5176, 569767), 'nature-impact': (5176, 568516),
    'arcane-cast': (5143, 568938), 'arcane-impact': (1449, 569631),
    'arcane-explosion': (1449, 568678),
}

def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read()

def main():
    EVIDENCE.mkdir(exist_ok=True)
    paths = LIST.read_text(encoding='utf-8-sig').splitlines()
    evidence_list = EVIDENCE / 'vanilla-sound-paths.csv'
    evidence_list.write_bytes(LIST.read_bytes())
    entries = []
    for slug, (spell, file_id) in SELECTION.items():
        page = EVIDENCE / f'spell-{spell}.html'
        url = f'https://www.wowhead.com/classic/spell={spell}'
        if not page.exists():
            page.write_bytes(fetch(url))
        candidates = [json.loads(m.group()) for m in re.finditer(r'\{"id":\d+,"title":"[^"]+","url":"[^"]+","type":"(?:\\.|[^"])*"\}', page.read_text(encoding='utf-8'))]
        source = next(s for s in candidates if s['id'] == file_id)
        original = next(p for p in paths if p.lower().endswith('\\' + source['title'].lower() + '.wav'))
        data = fetch(source['url'])
        assert data[:4] == b'OggS'
        header = data.index(b'\x01vorbis')
        sample_rate = struct.unpack('<I', data[header + 12:header + 16])[0]
        cursor = granule = 0
        while cursor < len(data):
            assert data[cursor:cursor + 4] == b'OggS'
            count = data[cursor + 26]
            position = struct.unpack('<Q', data[cursor + 6:cursor + 14])[0]
            if position != 0xffffffffffffffff:
                granule = max(granule, position)
            cursor += 27 + count + sum(data[cursor + 27:cursor + 27 + count])
        assert cursor == len(data)
        (PUBLIC / f'{slug}.ogg').write_bytes(data)
        entries.append(dict(id=slug, fileDataId=file_id, title=source['title'], path=f'sounds/{slug}.ogg', url=source['url'], sourcePage=url, sourcePageSha256=hashlib.sha256(page.read_bytes()).hexdigest(), vanillaPath=original, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data), durationSeconds=round(granule / sample_rate, 4), transformation='none'))
    manifest = dict(status='reference', versionCaveat='Classic-served OGG encoding; Vanilla filename membership verified, not byte-certified against a 2019 launch client.', vanillaList=dict(repository='https://github.com/fondlez/wow-sounds', revision='c29b446631c5add9334dbf2376843bde30b66c1f', sha256=hashlib.sha256(LIST.read_bytes()).hexdigest()), sounds=entries)
    (EVIDENCE / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(entries)} original audio files, {sum(e["bytes"] for e in entries)} bytes')

if __name__ == '__main__':
    main()
