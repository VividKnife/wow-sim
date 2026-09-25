"""Assemble original Classic continent textures and geographic region extents."""
import concurrent.futures, csv, hashlib, io, json
from pathlib import Path
from urllib.request import urlopen
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache/world-atlas';CACHE.mkdir(parents=True,exist_ok=True)
REV='b852b560442b31579e77ef3967b3c2d594832da8'
def get(url):
    path=CACHE/hashlib.sha256(url.encode()).hexdigest()
    if not path.exists():
        with urlopen(url,timeout=45) as r:path.write_bytes(r.read())
    return path.read_bytes()
csv_url='https://raw.githubusercontent.com/TheGrayDot/wow-vanilla-world-coords/a89f74022f5737295dc805640a35f7b0f770fb40/worldmaparea.csv'
rows={r['AreaName']:r for r in csv.DictReader(get(csv_url).decode().splitlines())}
atlas=json.loads((ROOT/'packages/game-data/data/world-map-atlas.json').read_text())
def bounds(row):return [float(row[k]) for k in ['LocLeft','LocRight','LocTop','LocBottom']]
result={'source':f'https://github.com/Gethe/wow-ui-textures/tree/{REV}/WorldMap','boundsSource':csv_url,'copyright':'World of Warcraft client textures © Blizzard Entertainment.','continents':[]}
for area,name,world in [('Kalimdor','卡利姆多',1),('Azeroth','东部王国',0)]:
    listing=json.loads(get(f'https://api.github.com/repos/Gethe/wow-ui-textures/contents/WorldMap/{area}?ref={REV}'))
    files={r['name']:r for r in listing}
    def tile(i):
        file=files[f'{area}{i}.PNG'];raw=get(file['download_url'])
        assert hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()==file['sha']
        return Image.open(io.BytesIO(raw)).convert('RGB')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: tiles=list(pool.map(tile,range(1,13)))
    image=Image.new('RGB',(1024,768))
    for i,im in enumerate(tiles):image.paste(im,(i%4*256,i//4*256))
    image=image.crop((0,0,1002,668))
    image.save(ROOT/f'apps/web/public/maps/{area.lower()}-continent.webp','WEBP',quality=90,method=6)
    continent=bounds(rows[area]);left,right,top,bottom=continent
    regions=[]
    for region,value in atlas['regions'].items():
        row=next(r for r in rows.values() if bounds(r)==value['bounds'])
        if int(row['MapID'])!=world:continue
        l,r,t,b=value['bounds']
        regions.append({'id':region,'x':((l+r)/2-left)/(right-left)*100,'y':((t+b)/2-top)/(bottom-top)*100,'width':(r-l)/(right-left)*100,'height':(b-t)/(bottom-top)*100})
    result['continents'].append({'id':area.lower(),'name':name,'image':f'/maps/{area.lower()}-continent.webp','bounds':continent,'regions':regions})
(ROOT/'packages/game-data/data/world-atlas.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print([(c['name'],len(c['regions']))for c in result['continents']])
