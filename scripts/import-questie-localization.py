"""Fill missing Classic quest Chinese text from a pinned Questie-X database."""
import hashlib
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '9ec28ddb0651ad4398bbe373630b424a33bfb855'
EXPECTED_SHA256 = 'c35b0795f6d3247118fbc8c4f1baf474a4d83bcd09d15b23df91195892a4e471'
URL = f'https://raw.githubusercontent.com/Xurkon/Questie-X-ClassicDB/{COMMIT}/Localization/lookups/Classic/lookupQuests/zhCN.lua'
CACHE = ROOT / '.cache/source-data/questie-zhCN.lua'
OUTPUT = ROOT / 'packages/game-data/data/quest-localization-supplement.json'
ROW = re.compile(r'^\[(\d+)\] = \{"([^"]+)"')
STRINGS = re.compile(r'"([^"]*)"')
HAN = re.compile(r'[\u3400-\u9fff]')
MANUAL_TITLES = {
    960: '奥努正在冥想',
    9257: '埃提耶什，守护者的传说之杖',
    9269: '埃提耶什，守护者的传说之杖',
    9270: '埃提耶什，守护者的传说之杖',
    9271: '埃提耶什，守护者的传说之杖',
    9333: '银色黎明手套',
    9339: '盗贼的奖励',
}

world = json.loads((ROOT / 'packages/game-data/data/world-reference.json').read_text())
classic = json.loads((ROOT / 'packages/game-data/data/classic-reference.json').read_text())
existing = json.loads((ROOT / 'packages/game-data/data/world-localization.json').read_text())['quests']
ids = {row[0] for row in json.loads(world['tableData']['quest_template'])}
ids.update(row[0] for row in classic['tables']['quest_template'])
if not CACHE.exists():
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_bytes(urllib.request.urlopen(URL, timeout=60).read())
raw = CACHE.read_bytes()
digest = hashlib.sha256(raw).hexdigest()
if digest != EXPECTED_SHA256:
    raise ValueError('Questie quest source checksum mismatch')
result = {}
for line in raw.decode('utf-8-sig').splitlines():
    match = ROW.match(line)
    if not match or int(match[1]) not in ids:
        continue
    entry, title = match.groups()
    groups = re.findall(r'\{([^{}]*)\}', line[match.end():])
    details = '\n\n'.join(STRINGS.findall(groups[0])) if groups else ''
    objectives = '\n\n'.join(STRINGS.findall(groups[1])) if len(groups) > 1 else ''
    current = existing.get(entry, {})
    supplement = {}
    for key, value in [('nameZhCN', title), ('detailsZhCN', details), ('objectiveSummaryZhCN', objectives)]:
        if HAN.search(value) and not HAN.search(current.get(key) or ''):
            supplement[key] = value.replace('<name>', '$N').replace('<class>', '$C').replace('<race>', '$R')
    if supplement:
        result[entry] = supplement
for entry, title in MANUAL_TITLES.items():
    if entry in ids:
        result.setdefault(str(entry), {})['nameZhCN'] = title

OUTPUT.write_text(json.dumps({'source': {'url': URL, 'sha256': digest}, 'quests': result}, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Questie supplement: {len(result)} quests, sha256 {digest}')
