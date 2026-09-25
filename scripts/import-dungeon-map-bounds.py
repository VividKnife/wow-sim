"""Read pinned map boundaries as text, never execute Lua."""
import json,re,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
URL='https://gist.githubusercontent.com/Stanzilla/51b3422e9039908990ed/raw/b2649d31c0c6b64b1515ce8064529c4a231e10de/library.lua'
path=ROOT/'.cache/libmapdata.lua'
if not path.exists():path.write_bytes(urllib.request.urlopen(URL,timeout=60).read())
names={'Ragefire','WailingCaverns','ShadowfangKeep','BlackfathomDeeps','Gnomeregan','RazorfenKraul','RazorfenDowns','ScarletMonastery','Uldaman','ZulFarrak','Maraudon','TheTempleOfAtalHakkar','BlackrockDepths','BlackrockSpire','DireMaul','Scholomance','Stratholme','OnyxiasLair'}
bounds={}
for block in re.split(r'mapData\[\d+\]\s*=',path.read_text(encoding='utf8')):
    match=re.search(r"\['name'\]\s*=\s*\"([^\"]+)\"",block)
    if not match or match[1] not in names:continue
    key={'BlackfathomDeeps':'BlackFathomDeeps'}.get(match[1],match[1])
    if key in bounds:continue # Original instance precedes revamped expansion maps.
    floors={}
    for floor,values in re.findall(r'\[(\d+)\]\s*=\s*\{\s*([\d.,\s-]+)\}',block):
        values=[float(v.strip()) for v in values.split(',') if v.strip()]
        if len(values)==6:floors[floor]=values
    bounds[key]=floors
(ROOT/'packages/game-data/data/dungeon-map-bounds.json').write_text(json.dumps({'source':URL,'bounds':bounds},indent=2)+'\n',encoding='utf8')
print('Registered map bounds:',{k:len(v) for k,v in bounds.items()})
