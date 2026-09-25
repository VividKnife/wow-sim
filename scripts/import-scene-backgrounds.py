"""Import credited in-game screenshots from Warcraft Wiki, never generated artwork.

HTML and originals are cached; the manifest records the exact image chosen.
Run with Python + Pillow. Review the contact sheet after adding/changing sources.
"""
import concurrent.futures, hashlib, io, json, re, time, subprocess
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, unquote, urljoin
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/scene-backgrounds'
OUT = ROOT / 'apps/web/public/scenes'
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
atlas = json.loads((ROOT / 'packages/game-data/data/world-map-atlas.json').read_text())
titles = {'elwynn':'Elwynn Forest','stormwind':'Stormwind City','barrens':'Barrens','hinterlands':'The Hinterlands','ungoro-crater':"Un'Goro Crater",'blackwing-lair':"Nefarian's Lair",'blackrock-depths':'Shadowforge City','razorfen-downs':'Spiral of Thorns','sunken-temple':'Temple of Atal\'Hakkar','onyxias-lair':"Onyxia's Lair",'stockades':'The Stockade','deadmines':'The Deadmines','zul-farrak':"Zul'Farrak"}
regions = {name: value['image'].split('/')[-1].replace('-classic.jpg','') for name,value in atlas['regions'].items()}
dungeon_ids = json.loads((ROOT/'packages/game-data/data/dungeon-presentation.json').read_text())['dungeons']
groups = {key:key for key in dungeon_ids}
preferred={'deadmines':'Ironclad_Cove.jpg','orgrimmar':'Orgrimmar_Gates_Classic_2.jpg','dire-maul':'Dire_Maul.jpg','gnomeregan':'GnomereganHalls.jpg','molten-core':'MoltenCore.JPG','maraudon':"Zaetar's_Grave.jpg",'ragefire-chasm':'Searing_Blade1.jpg'}
# Explicit, reviewed interior/subzone sources: each playable wing has its own
# scene. Never let an article's first thumbnail silently select another wing,
# a world map, or a later expansion's remake.
selected = {
    'scarlet-monastery-graveyard':('Scarlet Monastery Graveyard','Forlorn_Cloister.jpg'),
    'scarlet-monastery-library':('Athenaeum (Scarlet Monastery)','Athenaeum.jpg'),
    'scarlet-monastery-armory':("Crusader's Armory","Crusader's_Armory.jpg"),
    'scarlet-monastery-cathedral':("Crusader's Chapel","Crusader's_Chapel.jpg"),
    'maraudon-purple':('Maraudon','Vyletongue_Seat.jpg'),
    'maraudon-orange':('Maraudon','Noxious_Hollow.jpg'),
    'maraudon-inner':('Maraudon',"Zaetar's_Grave.jpg"),
    'dire-maul-east':('Warpwood Quarter','Warpwood_Quarter.jpg'),
    'dire-maul-west':('Capital Gardens','Capital_Gardens.jpg'),
    'dire-maul-north':('Gordok Commons',"Gordok's_Seat.jpg"),
    'stratholme-live':('Stratholme (Classic)','Scarlet.jpg'),
    'stratholme-undead':('Stratholme (Classic)','The_slaughterhouse.jpg'),
    'lower-blackrock-spire':('Hordemar City','Hordemar_City.jpg'),
    'upper-blackrock-spire':('Blackrock Stadium','Blackrock_Stadium.jpg'),
    'onyxias-lair':('Onyxia (tactics)','Lady_Onyxia.jpg'),
}
keys = sorted(set(regions.values()) | set(groups.values()))

rate_limited=False
def download(url, path):
    global rate_limited
    if path.exists(): return path.read_bytes()
    if rate_limited: raise RuntimeError('Source rate limited; rerun later to resume from cache')
    result = subprocess.run(['curl','--fail','-LsS','-A','wow-sim-local-prototype/1.0 (scene attribution importer)','--max-time','20',url],capture_output=True)
    if result.returncode:
        if b'429' in result.stderr: rate_limited=True
        raise RuntimeError(result.stderr.decode())
    data = result.stdout
    path.write_bytes(data)
    time.sleep(.8)
    return data

class Images(HTMLParser):
    def __init__(self): super().__init__(); self.items=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag!='img': return
        w,h=int(a.get('data-file-width','0')),int(a.get('data-file-height','0'))
        alt=a.get('alt','')+' '+a.get('src','')
        if w>=400 and h>=250 and w/h>=1.2 and not re.search(r'logo|map|loading|TCG|Hearthstone|artwork|concept|patch|WoW Icon|Detention_Block|CGI|comic|bosses|RPG|key_art|Exploring_Azeroth|Journey_Trailer|_HS|Traveler',alt,re.I): self.items.append(a)

def fetch(key):
    slug=key.lower().replace(' ','-')
    filename=slug+('-ironclad' if key=='deadmines' else '')
    record=CACHE/(slug+'.json')
    if record.exists():
        cached=json.loads(record.read_text())
        source_name=unquote(cached.get('source','').rsplit('/',1)[-1])
        if (key not in selected or source_name==selected[key][1]) and (ROOT/'apps/web/public'/cached.get('image','missing').lstrip('/')).is_file():
            return key,cached
    title=titles.get(key,key.replace('-',' ').title().replace(' Of ',' of '))
    error=None
    for article in ([selected[key][0]] if key in selected else [title+' (Classic)',title] if key in regions.values() or key in ['ragefire-chasm','scarlet-monastery','onyxias-lair'] else [title]):
        page='https://warcraft.wiki.gg/wiki/'+quote(article.replace(' ','_'),safe="()'")
        try:
            html=download(page,CACHE/(quote(article,safe='')+'.html')).decode()
            parser=Images();parser.feed(html)
            if not parser.items: raise ValueError('No landscape screenshot found')
            desired=selected[key][1] if key in selected else preferred.get(key)
            a=next((a for a in parser.items if desired and unquote(a['src']).split('/')[-2]==desired),None)
            if key in selected and a is None: raise ValueError('Reviewed screenshot missing: '+desired)
            a=a or parser.items[0]
            a['alt']=a.get('alt') or unquote(a['src'].split('/')[3]).replace('_',' ')
            src=a['src'].split('?')[0]
            if '/thumb/' in src: src=src.replace('/thumb/','/').rsplit('/',1)[0]
            url=urljoin(page,src)
            raw=download(url,CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.image'))
            image=Image.open(io.BytesIO(raw)).convert('RGB')
            original=image.size
            image.thumbnail((1600,1000))
            image.save(OUT/(filename+'.webp'),'WEBP',quality=82,method=6)
            print('OK',key,a['alt'],original,flush=True)
            entry={'image':'/scenes/'+filename+'.webp','page':page,'source':url,'title':a['alt'],'originalSize':original,'sha256':hashlib.sha256(raw).hexdigest()}
            record.write_text(json.dumps(entry,ensure_ascii=False))
            return key,entry
        except Exception as e:
            error=str(e)+(getattr(e,'stderr',b'').decode(errors='replace'))
            print('SOURCE ERROR',key,page,error,flush=True)
    print('MISSING',key,error,flush=True)
    return key,{'error':error}

if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool: assets=dict(pool.map(fetch,keys))
    missing=[key for key,entry in assets.items() if not entry.get('image')]
    if missing: raise SystemExit('Incomplete import; existing manifests preserved: '+', '.join(missing))
    for entry in assets.values():
        if entry.get('source'): entry['filePage']='https://warcraft.wiki.gg/wiki/File:'+entry['source'].rsplit('/',1)[-1]
    manifest={'copyright':'World of Warcraft imagery © Blizzard Entertainment. Screenshots sourced from the linked Warcraft Wiki file pages; see each file page for contributor and licensing details.','assets':assets,'regions':regions,'dungeons':groups}
    (ROOT/'docs/research/import/scene-backgrounds-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    runtime={'regions':{key:assets[slug].get('image') for key,slug in regions.items()},'dungeons':{key:assets[slug].get('image') for key,slug in groups.items()}}
    (ROOT/'packages/game-data/data/scene-backgrounds.json').write_text(json.dumps(runtime,ensure_ascii=False,indent=2)+'\n')
    sheet=Image.new('RGB',(1000,150*((len(keys)+3)//4)), '#181818');draw=ImageDraw.Draw(sheet)
    for i,key in enumerate(keys):
        path=ROOT/'apps/web/public'/assets[key].get('image','missing').lstrip('/')
        x,y=i%4*250,i//4*150
        if path.exists():
            im=Image.open(path);im.thumbnail((248,120));sheet.paste(im,(x,y))
        draw.text((x+4,y+123),key,fill='white')
    sheet.save(CACHE/'contact-sheet.jpg')
