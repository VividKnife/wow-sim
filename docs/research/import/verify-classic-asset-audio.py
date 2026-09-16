"""Decode the collected Vorbis files with soundfile/libsndfile (pip install soundfile)."""
import hashlib
import json
from pathlib import Path

import soundfile as sf

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).with_name('classic-asset-library')


def main():
    raw = (OUT / 'manifest.json').read_bytes()
    manifest = json.loads(raw)
    rows = []
    for asset in manifest['assets']:
        if asset['category'] != 'sounds':
            continue
        path = ROOT / 'apps/web/public' / asset['path']
        if hashlib.sha256(path.read_bytes()).hexdigest() != asset['sha256']:
            raise ValueError(f'Hash mismatch: {path}')
        data, rate = sf.read(path, always_2d=True)
        if (rate != asset['sampleRateHz'] or data.shape[1] != asset['channels']
                or round(len(data) / rate, 4) != asset['durationSeconds']):
            raise ValueError(f'Decoded metadata mismatch: {path}')
        rows.append({'path': asset['path'], 'sha256': asset['sha256'], 'frames': len(data),
                     'channels': data.shape[1], 'sampleRateHz': rate})
    result = {'soundfileVersion': sf.__version__, 'libsndfileVersion': sf.__libsndfile_version__,
              'manifestSha256': hashlib.sha256(raw).hexdigest(), 'decoded': len(rows), 'assets': rows}
    (OUT / 'audio-decode-check.json').write_text(json.dumps(result, indent=2) + '\n',
                                               encoding='utf8', newline='\n')
    print(f'Decoded {len(rows)} Vorbis files; rate/channels/duration all match manifest')


if __name__ == '__main__':
    main()
