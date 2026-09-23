"""Shared Classic bodies with starter/T1 skins and native equipment attachments.

Only sixteen body/skeleton/animation files are shipped. Appearance presets share
those files, deduplicated lossless WebP skins, and helmet/shoulder/weapon meshes.
"""
import concurrent.futures
import importlib.util
import io
import json
import re
import threading
from pathlib import Path
from PIL import Image

spec=importlib.util.spec_from_file_location('battle',Path(__file__).with_name('import-classic-battle-models.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
ROOT=b.ROOT;OUT=ROOT/'apps/web/public/characters/classic';URL='/characters/classic'
MANIFEST=ROOT/'packages/game-data/data/classic-characters-manifest.json'
RACES={1:[1,2,3,4,5,6,7,8],2:[1,3],3:[2,3,4,6,8],4:[1,2,3,4,5,7,8],5:[1,3,4,5,8],7:[2,6,8],8:[1,5,7,8],9:[1,2,5,7],11:[4,6]}
STARTER={1:{4:38,7:39,8:40},2:{4:45,7:44,8:43},3:{5:236,7:237,8:40},4:{4:49,7:48,8:40},5:{20:57,8:55},7:{4:6125,7:237,8:40},8:{20:56,8:55},9:{20:57,8:55},11:{20:6139,8:55}}
T1={
 1:{1:16866,3:16868,5:16865,7:16867,8:16862,9:16861,10:16863,6:16864},
 2:{1:16854,3:16856,5:16853,7:16855,8:16859,9:16857,10:16860,6:16858},
 3:{1:16846,3:16848,5:16845,7:16847,8:16849,9:16850,10:16852,6:16851},
 4:{1:16821,3:16823,5:16820,7:16822,8:16824,9:16825,10:16826,6:16827},
 5:{1:16813,3:16816,20:16815,7:16814,8:16811,9:16819,10:16812,6:16817},
 7:{1:16842,3:16844,5:16841,7:16843,8:16837,9:16840,10:16839,6:16838},
 8:{1:16795,3:16797,20:16798,7:16796,8:16800,9:16799,10:16801,6:16802},
 9:{1:16808,3:16807,20:16809,7:16810,8:16803,9:16804,10:16805,6:16806},
 11:{1:16834,3:16836,20:16833,7:16835,8:16829,9:16830,10:16831,6:16828},
}
SET_NAMES={1:'力量',2:'秩序之源',3:'巨人追猎者',4:'夜幕杀手',5:'预言',7:'大地之怒',8:'奥术师',9:'恶魔之心',11:'塞纳里奥'}
WEAPONS={1:25,2:36,3:37,4:2092,5:35,7:36,8:35,9:35,11:35}

def identify(item):
    url=f'https://www.wowhead.com/classic/item={item}'
    raw=b.fetch(f'items/{item}.html',url)
    match=re.search(rb'linksButton.dataset.displayId\s*=\s*(\d+)',raw)
    assert match,f'Missing item display: {item}'
    slot=re.search(rb'data-mv-slot="(\d+)"',raw)
    assert slot,f'Missing item slot: {item}'
    return str(item),{'displayId':int(match[1]),'slot':int(slot[1]),'source':url,'sha256':b.m2.digest(raw)}

def skin(path):
    image=Image.open(path).convert('RGBA');encoded=io.BytesIO();image.save(encoded,format='WEBP',lossless=True)
    raw=encoded.getvalue();name=b.m2.digest(raw)[:24]+'.webp';target=OUT/'skins'/name
    target.parent.mkdir(exist_ok=True);target.write_bytes(raw)
    return f'{URL}/skins/{name}'

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    checkpoint=b.m2.CACHE/'character-appearances-progress.json'
    data=json.loads(checkpoint.read_text()) if checkpoint.exists() else {'schemaVersion':2,'copyright':'Blizzard Entertainment artwork; Classic assets hosted by Wowhead.','bodies':{},'appearances':{},'gear':{},'items':{},'sets':SET_NAMES}
    all_items=set(WEAPONS.values())|{i for presets in [STARTER,T1] for outfit in presets.values() for i in outfit.values()}
    with concurrent.futures.ThreadPoolExecutor(6) as pool:data['items'].update(dict(pool.map(identify,all_items)))
    def display(item):return data['items'][str(item)]['displayId']
    save_lock=threading.Lock()
    def save():
        with save_lock:checkpoint.write_text(json.dumps(data,indent=2)+'\n')
    def gear(meta,race,gender,component=0):
        res=meta['ComponentModels'][str(component)]
        options=meta['ModelFiles'][str(res)]
        options=[o for o in options if o['Race'] in [0,race] and o['Gender'] in [gender,2,3]]
        assert options,'No matching equipment geometry'
        chosen=max(options,key=lambda o:(o['Race']==race,o['Gender']==gender,o['ExtraData']==component))
        fid=chosen['FileDataId'];textures=meta['Textures2'] if component==1 and meta.get('Textures2') else meta['Textures']
        key=f"gear-{fid}-{b.m2.digest(json.dumps(textures,sort_keys=True).encode())[:8]}"
        if key not in data['gear']:
            asset=b.m2.convert(key,{**meta,'Model':fid,'Textures':textures,'_character':True},OUT,URL,b.CLIPS)
            data['gear'][key]=asset
        return data['gear'][key]['path']
    transparent=b.m2.CACHE/'composites/transparent.png';Image.new('RGBA',(1,1)).save(transparent)
    def build_body(race,gender):
        body_key=f'{race}-{gender}';char_id=(race-1)*2+gender+1
        base=b.metadata(f'character/{char_id}');custom=b.metadata(f'charactercustomization/{char_id}')
        assert base['Character']['Race']==race and base['Character']['Gender']==gender
        hair=next((o for o in custom['Options'] if o['Id']==custom.get('HairStyleOptionId')),None)
        choices=[{'optionId':hair['Id'],'choiceId':hair['Choices'][min(1,len(hair['Choices'])-1)]['Id']}] if hair and hair['Choices'] else []
        template={**base,'_character':True,'Creature':{'CreatureCustomizations':choices}}
        naked=b.character(template,'body-'+body_key)
        if body_key not in data['bodies']:
            # Retain every body section once. Per-preset geosets select visible meshes.
            full={k:v for k,v in naked.items() if k!='_geosets'}
            full['Textures']={**{str(k):str(transparent) for k in [1,2,6,8]},**full['Textures']}
            data['bodies'][body_key]=b.m2.convert('body-'+body_key,full,OUT,URL,b.CLIPS)
        for class_id,races in RACES.items():
          if race not in races:continue
          for tier,presets in [('starter',STARTER),('t1',T1)]:
            key=f'{body_key}-{class_id}-{tier}'
            if key in data['appearances']:continue
            outfit=presets[class_id];equipment={str(data['items'][str(item)]['slot']):display(item) for item in outfit.values()}
            meta=b.character({**template,'Equipment':equipment},key)
            visible=set(meta['_geosets']);attachments=[]
            weapon=b.metadata(f'item/{display(WEAPONS[class_id])}')
            attachments.append({'point':1,'src':gear(weapon,race,gender)})
            for slot,point in [(1,11),(3,6)]:
                if slot not in outfit:continue
                armor=b.metadata(f'armor/{slot}/{display(outfit[slot])}')
                attachments.append({'point':point,'src':gear(armor,race,gender)})
                if slot==3:attachments.append({'point':5,'src':gear(armor,race,gender,1)})
                if slot==1:
                    hidden=armor['Item'].get('HideGeosetFemale' if gender else 'HideGeosetMale') or []
                    for rule in hidden:
                        if rule['RaceId']!=race:continue
                        group=rule['GeosetGroup'];visible={g for g in visible if not (0<g<100 if group==0 else g//100==group)}
            data['appearances'][key]={'raceId':race,'gender':'female' if gender else 'male','classId':class_id,'tier':tier,
              'body':body_key,'geosets':sorted(visible),'textures':{kind:skin(path) for kind,path in meta['Textures'].items()},
              'attachments':attachments,'twoHanded':weapon['Item']['InventoryType']==17,'items':list(outfit.values())}
            save();print('Appearance',key,len(data['appearances']),flush=True)
    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        jobs=[pool.submit(build_body,race,gender) for race in range(1,9) for gender in [0,1]]
        for job in concurrent.futures.as_completed(jobs):job.result()
    assert len(data['bodies'])==16 and len(data['appearances'])==160
    MANIFEST.write_text(json.dumps(data,indent=2)+'\n')
    print('Complete:',len(data['bodies']),'shared bodies,',len(data['appearances']),'appearances,',len(data['gear']),'equipment meshes',flush=True)

if __name__=='__main__':main()
