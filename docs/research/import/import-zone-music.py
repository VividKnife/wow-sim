"""Import a small, source-traceable Classic BGM selection."""
import concurrent.futures
import hashlib
import json
import pathlib
import io
import soundfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[3]
DEST = ROOT / 'apps/web/public/music'
EVIDENCE = ROOT / 'docs/research/import/zone-music'
URL = 'https://www.wowhead.com/classic/sounds/zone-music'
SELECTION = {
    'forest': 53492, 'westfall': 53299, 'stormwind': 53205,
    'orgrimmar': 53198, 'undercity': 53217, 'thunderbluff': 53213,
    'darnassus': 53184, 'ironforge': 53192, 'moonglade': 53486,
    'deadmines': 53428,
}

def fetch(url):
    for attempt in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20).read()
        except OSError:
            if attempt == 2:
                raise

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    page = (EVIDENCE / 'source.html').read_bytes() if (EVIDENCE / 'source.html').exists() else fetch(URL)
    entries = json.JSONDecoder().raw_decode(page.decode().split('new Listview(')[1].split('"data":')[1])[0]
    files = {}
    for entry in entries:
        for file in entry['files']:
            files.setdefault(file['id'], (entry, file))
    missing = {slug: file_id for slug, file_id in SELECTION.items() if file_id not in files}
    if missing:
        raise ValueError(f'Missing files: {missing}; city candidates: {[(e["name"], e["files"]) for e in entries if any(k in e["name"].lower() for k in ["ironforge", "darnassus"])]}')
    (EVIDENCE / 'source.html').write_bytes(page)
    def download(item):
        slug, file_id = item
        entry, source = files[file_id]
        data = fetch(source['url'])
        source_hash = hashlib.sha256(data).hexdigest()
        padding = len(data) - len(data.lstrip(b'\x00'))
        data = data[padding:]
        try:
            samples, rate = soundfile.read(io.BytesIO(data))
        except Exception as error:
            raise ValueError(f'Cannot decode {slug}: {source["url"]}, header={data[:24]!r}') from error
        assert len(samples) > rate, source
        (DEST / f'{slug}.mp3').write_bytes(data)
        return dict(key=slug, path=f'music/{slug}.mp3', fileDataId=file_id,
                    title=source['title'], soundName=entry['name'], url=source['url'],
                    sourcePage=f'https://www.wowhead.com/classic/sound={entry["id"]}',
                    sourceSha256=source_hash, removedLeadingZeroBytes=padding,
                    sha256=hashlib.sha256(data).hexdigest(), bytes=len(data), durationSeconds=round(len(samples)/rate, 3))
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        tracks = list(pool.map(download, SELECTION.items()))
    manifest = dict(source=URL, sourceSha256=hashlib.sha256(page).hexdigest(),
                    caveat='Classic-served MP3; leading zero padding removed where present, audio frames unchanged. Curated looping selection, not the full client playlist or subzone/day-night rules.', tracks=tracks)
    (EVIDENCE / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(tracks)} tracks; {sum(t["bytes"] for t in tracks)} bytes')

if __name__ == '__main__':
    main()
