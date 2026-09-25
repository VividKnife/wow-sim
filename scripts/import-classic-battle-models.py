"""Bake local Classic battle GLBs, including character-based NPC appearances.

Shares the M2/skin/animation converter with the MC import. Downloads are cached;
each completed model is checkpointed so interrupted imports can be resumed.
"""
import argparse
import concurrent.futures
import importlib.util
import io
import json
import threading
from pathlib import Path
from PIL import Image

spec=importlib.util.spec_from_file_location('m2',Path(__file__).with_name('import-molten-core-models.py'))
m2=importlib.util.module_from_spec(spec);spec.loader.exec_module(m2)
ROOT=m2.ROOT
OUT=ROOT/'apps/web/public/creatures/classic'
MANIFEST=ROOT/'packages/game-data/data/classic-battle-models-manifest.json'
CLIPS={0,1,4,5,8,9,10,14,16,17,18,19,25,32,51,52,53,54,74,124,125,127,201,202}
lock=threading.Lock()
# Serialize writes to the shared raw cache (many NPCs reuse a single model).
raw_fetch=m2.fetch
locks={}
def fetch(path,url=None):
    with lock:key=locks.setdefault(path,threading.Lock())
    with key:return raw_fetch(path,url)
m2.fetch=fetch
def metadata(path):return json.loads(fetch('meta/'+path+'.json'))
def file_id(files,resource,gender=0,race=1):
    options=files.get(str(resource),[])
    matching=[v for v in options if v['Gender'] in [gender,2,3] and v['Race'] in [0,race]]
    assert matching, f'No texture variant {resource}/{gender}/{race}'
    return max(matching,key=lambda v:(v['Race']==race,v['Gender']==gender))['FileDataId']
def texture(fid):return Image.open(io.BytesIO(fetch(f'textures/{fid}.webp'))).convert('RGBA')

def character(meta,key):
    char=meta['Character'];race,gender=char['Race'],char['Gender']
    body=metadata(f"character/{char['ChrModelId']}")
    custom=metadata(f"charactercustomization/{char['ChrModelId']}")
    selections={c['optionId']:c['choiceId'] for c in (meta.get('Creature') or {}).get('CreatureCustomizations',[])}
    choices=[next((c for c in o['Choices'] if c['Id']==selections.get(o['Id'])),o['Choices'][0]) for o in custom['Options'] if o['Choices']]
    chosen={c['Id'] for c in choices}
    elements=[e for c in choices for e in c['Elements'] if not e['VariationChoiceID'] or e['VariationChoiceID'] in chosen]
    # Classic base body, ordinary sleeves/boots/trousers, selected hair/facial hair.
    geos={n:1 for n in range(1,14)};geos[7]=2
    for e in elements:
        g=e.get('Geoset')
        if g:geos[g['GeosetType']]=g['GeosetID']
    geos.setdefault(0,1)
    maps={}
    targets={e['Material']['TextureTarget']:e['Material']['MaterialResourcesID'] for e in elements if e.get('Material')}
    sections={s['SectionType']:s for s in custom['TextureSections']}
    for layer in sorted(custom['TextureLayers'],key=lambda l:l['Layer']):
        target=targets.get(layer['ChrModelTextureTargetID'])
        if target is None:continue
        image=texture(file_id(custom['TextureFiles'],target,gender,race))
        kind=layer['TextureType']
        material=next(x for x in custom['Materials'] if x['TextureType']==kind)
        canvas=maps.setdefault(kind,Image.new('RGBA',(material['Width'],material['Height'])))
        section=sections.get(layer['TextureSection'])
        box=(0,0,canvas.width,canvas.height) if not section else tuple(round(v) for v in (section['X']*canvas.width,section['Y']*canvas.height,section['Width']*canvas.width,section['Height']*canvas.height))
        canvas.alpha_composite(image.resize(box[2:]),box[:2])
    creature=meta.get('Creature') or {}
    if creature.get('Texture'):
        maps[1]=texture(file_id(meta['TextureFiles'],creature['Texture'],gender,race))
    equipment=meta.get('Equipment') or {}
    order={4:0,7:1,8:2,5:3,20:3,19:4,9:5,6:6,10:7}
    for slot,display in sorted(equipment.items(),key=lambda pair:order.get(int(pair[0]),-1)):
        slot=int(slot)
        if slot not in [4,5,6,7,8,9,10,19,20]:continue
        armor=metadata(f'armor/{slot}/{display}')
        group=armor['Item']['GeosetGroup']
        if slot==10:geos[4]=1+group[0]
        if slot==8:geos[5]=1+group[0]
        if slot in [5,20] and group[0] and geos[4]==1:geos[8]=1+group[0]
        if slot in [5,20] and group[2]:geos[13]=1+group[2];geos[5]=0;geos[9]=0;geos[11]=0
        if slot==7 and group[0]:geos[11]=1+group[0]
        if not creature.get('Texture'):
            for region,res in (armor.get('ComponentTextures') or {}).items():
                section=sections.get(int(region))
                if section is None or 1 not in maps:continue
                canvas=maps[1];image=texture(file_id(armor['TextureFiles'],res,gender,race))
                box=tuple(round(v) for v in (section['X']*canvas.width,section['Y']*canvas.height,section['Width']*canvas.width,section['Height']*canvas.height))
                canvas.alpha_composite(image.resize(box[2:]),box[:2])
    generated=m2.CACHE/'composites';generated.mkdir(exist_ok=True)
    textures={}
    for kind,image in maps.items():
        path=generated/f'{key}-{kind}.png';image.save(path);textures[str(kind)]=str(path)
    return {**meta,'Model':body['Model'],'Textures':textures,'_geosets':{0}|{100*g+n for g,n in geos.items() if n>0}}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int);parser.add_argument('--display',type=int,nargs='*');parser.add_argument('--world',action='store_true');args=parser.parse_args()
    portraits=json.loads((ROOT/'packages/game-data/data/npc-models-manifest.json').read_text())
    data=json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {'schemaVersion':1,'copyright':'Blizzard Entertainment artwork. Original Classic assets hosted by Wowhead.','models':{},'characters':{}}
    displays=args.display or sorted({a['displayId'] for a in portraits['assets']})
    # Invisible event/credit/debug markers have no visible mesh or animation.
    data['invisibleDisplays']=[11686,13069,15294]
    displays=[d for d in displays if d not in data['invisibleDisplays']]
    if args.world:
        displays=json.loads((ROOT/'.cache/world-combat-displays.json').read_text(encoding='utf8'))
    pending=[d for d in displays if str(d) not in data['models']]
    if args.limit:pending=pending[:args.limit]
    failures=[]
    def convert(display):
        meta=metadata(f'npc/{display}')
        # These mechanical mounts explicitly leave the optional rider body slot
        # empty. Omit that mesh instead of inventing a driver texture.
        if display in [5926,6890,6891,6915]:meta['_emptyTextureSlots']=[1]
        if display==3019:meta['_staticModel']=True # stationary training dummy
        if not meta['Model']:meta=character(meta,display)
        elif (meta.get('Creature') or {}).get('Texture'):
            meta['Textures']={**(meta.get('Textures') or {}),'1':file_id(meta['TextureFiles'],meta['Creature']['Texture'])}
        result=m2.convert(display,meta,OUT,'/creatures/classic',CLIPS)
        portrait=ROOT/f'apps/web/public/creatures/portraits/classic-display-{display}.webp'
        if portrait.exists():
            result['portrait']=f'/creatures/portraits/classic-display-{display}.webp'
            result['portraitSha256']=m2.digest(portrait.read_bytes())
        return result
    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        jobs={pool.submit(convert,d):d for d in pending}
        for job in concurrent.futures.as_completed(jobs):
            display=jobs[job]
            try:
                data['models'][str(display)]=job.result()
                MANIFEST.write_text(json.dumps(data,indent=2)+'\n')
                print('OK',display,len(data['models']),flush=True)
            except Exception as error:
                failures.append((display,str(error)));print('FAIL',display,repr(error),flush=True)
    (m2.CACHE/'classic-import-failures.json').write_text(json.dumps(failures,indent=2))
    print('Done',len(data['models']),'models;',len(failures),'failures',flush=True)

if __name__=='__main__':main()
