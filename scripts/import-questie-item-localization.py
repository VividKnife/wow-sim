"""Fill remaining Classic item names using Questie zhTW names converted to zhCN.

Requires `opencc-python-reimplemented` when regenerating this checked-in data.
"""
import hashlib
import json
import re
import subprocess
import urllib.request
from pathlib import Path

from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '9ec28ddb0651ad4398bbe373630b424a33bfb855'
EXPECTED_SHA256 = '795582cf78585a0282a2948781cbd3d6625b8eeff41392981d07dddb46455a6f'
URL = f'https://raw.githubusercontent.com/Xurkon/Questie-X-ClassicDB/{COMMIT}/Localization/lookups/Classic/lookupItems/zhTW.lua'
CACHE = ROOT / '.cache/source-data/questie-items-zhTW.lua'
OUTPUT = ROOT / 'packages/game-data/data/item-localization-supplement.json'
HAN = re.compile(r'[\u3400-\u9fff]')
ROW = re.compile(r'^\[(\d+)\] = "([^"]+)"', re.MULTILINE)
MANUAL_NAMES = {5732: 'NG-5 型装置', 23710: '上层甲板三号外袍'}

existing = json.loads((ROOT / 'packages/game-data/data/world-localization.json').read_text())['items']
ids = set(json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {items} from './packages/game-domain/src/rules/catalog.js'; console.log(JSON.stringify(Object.keys(items).map(Number)))",
], cwd=ROOT)))
if not CACHE.exists():
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_bytes(urllib.request.urlopen(URL, timeout=60).read())
raw = CACHE.read_bytes()
digest = hashlib.sha256(raw).hexdigest()
if digest != EXPECTED_SHA256:
    raise ValueError('Questie item source checksum mismatch')
converter = OpenCC('t2s')
result = {}
for match in ROW.finditer(raw.decode('utf-8-sig')):
    entry, traditional = match.groups()
    if int(entry) not in ids or HAN.search(existing.get(entry, {}).get('nameZhCN') or ''):
        continue
    name = converter.convert(traditional)
    if HAN.search(name):
        result[entry] = {'nameZhCN': name}
for entry, name in MANUAL_NAMES.items():
    if entry in ids:
        result[str(entry)] = {'nameZhCN': name}
OUTPUT.write_text(json.dumps({'source': {'url': URL, 'sha256': digest, 'conversion': 'OpenCC t2s'}, 'items': result}, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Questie item supplement: {len(result)} items')
