"""Import pinned Blizzard journal artwork and original dungeon floor textures."""
import concurrent.futures, hashlib, io, json, re, urllib.request
from pathlib import Path
from urllib.parse import quote
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
REV='b852b560442b31579e77ef3967b3c2d594832da8'
CACHE=ROOT/'.cache/dungeon-presentation';CACHE.mkdir(parents=True,exist_ok=True)
PUBLIC=ROOT/'apps/web/public'
BASE=f'https://raw.githubusercontent.com/Gethe/wow-ui-textures/{REV}/'
def fetch(path,url):
    dest=CACHE/path;dest.parent.mkdir(parents=True,exist_ok=True)
    if not dest.exists():
        for attempt in range(3):
            try:dest.write_bytes(urllib.request.urlopen(url,timeout=40).read());break
            except Exception:
                if attempt==2:raise
    return dest.read_bytes()
def tree(folder):
    root=json.loads(fetch('root.json',f'https://api.github.com/repos/Gethe/wow-ui-textures/contents/?ref={REV}'))
    if '/' in folder:
        parent,child=folder.split('/')
        row=next(r for r in tree(parent) if r['path']==child)
        url=f'https://api.github.com/repos/Gethe/wow-ui-textures/git/trees/{row["sha"]}'
    else:url=next(r['git_url'] for r in root if r['name']==folder)
    return json.loads(fetch(folder+'.json',url))['tree']
assets=[]
def image(folder,row,dest):
    path=folder+'/'+row['path'];url=BASE+quote(path,safe='/');raw=fetch(path,url)
    assert hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()==row['sha']
    img=Image.open(io.BytesIO(raw)).convert('RGBA');target=PUBLIC/dest;target.parent.mkdir(parents=True,exist_ok=True)
    img.save(target,lossless=True)
    assets.append({'path':dest,'source':url,'gitBlob':row['sha'],'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'width':img.width,'height':img.height})
    return '/'+dest

cards={'ragefire-chasm':'RagefireChasm','wailing-caverns':'WailingCaverns','deadmines':'Deadmines','shadowfang-keep':'ShadowFangKeep','blackfathom-deeps':'BlackfathomDeeps','stockades':'TheStockade','gnomeregan':'Gnomeregan','razorfen-kraul':'RazorfenKraul','razorfen-downs':'RazorfenDowns','uldaman':'Uldaman','zul-farrak':'ZulFarrak','sunken-temple':'SunkenTemple','blackrock-depths':'BlackrockDepths','lower-blackrock-spire':'BlackrockSpire','upper-blackrock-spire':'BlackrockSpire','scholomance':'Scholomance'}
journal=json.loads((ROOT/'packages/game-data/data/dungeon-journal.json').read_text(encoding='utf8'))['dungeons']
ej={r['path']:r for r in tree('EncounterJournal')}
presentation={};portraits={}
normalize=lambda s:re.sub('[^a-z0-9]','',s.lower())
bossArt={normalize(k.removeprefix('UI-EJ-BOSS-').removesuffix('.PNG')):r for k,r in ej.items() if k.startswith('UI-EJ-BOSS-')}
def card(d):
    ident=d['id'];name=cards.get(ident)
    if ident.startswith('scarlet-monastery'):name='ScarletMonastery'
    if ident.startswith('maraudon'):name='Maraudon'
    if ident.startswith('dire-maul'):name='DireMaul'
    if ident.startswith('stratholme'):name='Stratholme'
    assert name,ident
    key='UI-EJ-DUNGEONBUTTON-'+name+'.PNG'
    presentation[ident]={'background':image('EncounterJournal',ej[key],f'journal/dungeons/{ident}.webp')}
    for b in d['bosses']:
        art=bossArt.get(normalize(b.get('nameEn') or b['name']))
        if art:portraits[str(b['id'])]=image('EncounterJournal',art,f'journal/bosses/{b["id"]}.webp')
cards.update({'molten-core':'MoltenCore','onyxias-lair':'Onyxia'})
with concurrent.futures.ThreadPoolExecutor(6)as pool:list(pool.map(card,journal+[{'id':'molten-core','bosses':[]},{'id':'onyxias-lair','bosses':[]}]))

floors={};names=['Ragefire','WailingCaverns','ShadowfangKeep','BlackFathomDeeps','Gnomeregan','RazorfenKraul','RazorfenDowns','ScarletMonastery','Uldaman']
names+=['ZulFarrak','Maraudon','TheTempleOfAtalHakkar','BlackrockDepths','BlackrockSpire','DireMaul','Scholomance','Stratholme','OnyxiasLair']
for name in names:
    rows={r['path']:r for r in tree('WorldMap/'+name)}
    indices=sorted({int(m[1])for k in rows if(m:=re.match(re.escape(name)+r'(\d+)_1\.PNG$',k)) and int(m[1])<10})
    outdoor=not indices and f'{name}1.PNG' in rows
    if outdoor:indices=[1]
    floors[name]=[]
    for floor in indices:
        def tile(n):
            r=rows[f'{name}{n}.PNG' if outdoor else f'{name}{floor}_{n}.PNG'];path=f'WorldMap/{name}/'+r['path'];raw=fetch(path,BASE+quote(path,safe='/'))
            assert hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()==r['sha']
            return n,Image.open(io.BytesIO(raw)).convert('RGB'),{'source':BASE+path,'gitBlob':r['sha']}
        with concurrent.futures.ThreadPoolExecutor(6)as pool:tiles=list(pool.map(tile,range(1,13)))
        canvas=Image.new('RGB',(1024,768))
        for n,img,_ in tiles:canvas.paste(img,(((n-1)%4)*256,((n-1)//4)*256))
        path=f'maps/dungeons/{name.lower()}-{floor}.webp';target=PUBLIC/path;target.parent.mkdir(parents=True,exist_ok=True);canvas.crop((0,0,1002,668)).save(target,lossless=True)
        floors[name].append({'id':floor,'image':'/'+path})
        assets.append({'path':path,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'tiles':[t[2]for t in tiles],'width':1002,'height':668})
        print(path,flush=True)
result={'revision':REV,'copyright':'Blizzard Entertainment artwork; source client snapshot 1.13.2.','dungeons':presentation,'bosses':portraits,'floors':floors}
(ROOT/'packages/game-data/data/dungeon-presentation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(ROOT/'docs/research/import/dungeon-presentation-manifest.json').write_text(json.dumps({'revision':REV,'assets':sorted(assets,key=lambda a:a['path'])},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Imported',len(presentation),'cards,',len(portraits),'boss portraits,',sum(map(len,floors.values())),'floors')
