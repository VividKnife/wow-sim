"""Import only display names and icon identities from the current Classic tooltip API.
PNG bytes are from the same pinned 2019 prelaunch archive as existing assets.
No tooltip damage/cost numbers enter the simulation.
"""
import concurrent.futures,hashlib,json,urllib.request,sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
APP=ROOT/'apps/web'
scope='deadmines-items' if '--deadmines-items' in sys.argv else 'deadmines' if '--deadmines' in sys.argv else 'companion'
kind='item' if scope=='deadmines-items' else 'spell'
OUT=ROOT/f'docs/research/import/{scope}-assets'
OUT.mkdir(parents=True,exist_ok=True)
COMMIT='b852b560442b31579e77ef3967b3c2d594832da8'
IDS=[78,284,285,71,355,7386,2050,2052,2053,2054,2061,139,6074,6075,585,591,598,1752,1757,1758,2098,6760,6761,2006]
if scope=='deadmines':IDS=[s['Id'] for s in json.loads((APP/'data/deadmines-reference.json').read_text(encoding='utf-8'))['tables']['spell_template']]
if scope=='deadmines-items':IDS=[5397]
tree=json.loads(Path('C:/workspace/wow-sim-research/icons/source-tree.json').read_text(encoding='utf-8-sig'))['tree']
by_name={r['path'].lower():r for r in tree}
def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'wow-sim-reference-import'}),timeout=30) as response:return response.read()
def tooltip(id):
    url=f'https://nether.wowhead.com/classic/tooltip/{kind}/{id}?locale=4'
    cached=OUT/f'{kind}-{id}.json'
    content=cached.read_bytes() if cached.exists() else fetch(url)
    (OUT/f'spell-{id}.json').write_bytes(content)
    return id,url,content,json.loads(content)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(tooltip,IDS))
icons=json.loads((APP/'data/icon-map.json').read_text(encoding='utf8'))
locale=json.loads((APP/'data/localization.json').read_text(encoding='utf8'))
manifest={'commit':COMMIT,'status':'2019 prelaunch Classic image snapshot; current Classic display strings only; no certification of 2019 numeric fidelity',kind+'s':[],'assets':[]}
downloaded={}
for id,url,content,data in rows:
    icon=data['icon'].lower()
    if icon+'.png' not in by_name:
        assert icon=='classic_temp',icon
        previous=locale[kind+'s'].get(str(id),{})
        locale[kind+'s'][str(id)]={**previous,'nameZhCN':data['name'],'sourceUrl':url}
        manifest[kind+'s'].append({'id':id,'icon':None,'nameZhCN':data['name'],'sourceUrl':url,'sourceSha256':hashlib.sha256(content).hexdigest(),'unavailable':'Current tooltip returns classic_temp; no matching image in pinned archive.'})
        continue
    entry=by_name[icon+'.png'];relative='assets/'+icon+'.png';path=APP/'public/icons'/relative
    if icon not in downloaded:
        source=f'https://raw.githubusercontent.com/Gethe/wow-ui-textures/{COMMIT}/ICONS/'+entry['path']
        binary=path.read_bytes() if path.exists() else fetch(source)
        digest=hashlib.sha1(b'blob '+str(len(binary)).encode()+b'\0'+binary).hexdigest()
        assert digest==entry['sha'],icon
        if not path.exists():path.write_bytes(binary)
        manifest['assets'].append({'file':relative,'url':source,'gitBlobSha1':digest,'sha256':hashlib.sha256(binary).hexdigest()})
        downloaded[icon]=True
    icons[kind+'s'][str(id)]=relative
    previous=locale[kind+'s'].get(str(id),{})
    locale[kind+'s'][str(id)]={**previous,'nameZhCN':data['name'],'sourceUrl':url}
    manifest[kind+'s'].append({'id':id,'icon':icon,'nameZhCN':data['name'],'sourceUrl':url,'sourceSha256':hashlib.sha256(content).hexdigest()})
locale['selectedCounts'][kind]=len(locale[kind+'s'])
(APP/'data/icon-map.json').write_text(json.dumps(icons,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(APP/'data/localization.json').write_text(json.dumps(locale,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({kind+'Mappings':len(rows),'uniqueOriginalImages':len(downloaded)}))
