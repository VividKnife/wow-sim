"""Extract classic WorldMapArea boundaries; never executes downloaded code."""
import csv,hashlib,json
from pathlib import Path
from urllib.request import urlopen
ROOT=Path(__file__).resolve().parents[1]
REVISION='a89f74022f5737295dc805640a35f7b0f770fb40'
SOURCE=f'https://raw.githubusercontent.com/TheGrayDot/wow-vanilla-world-coords/{REVISION}'
CACHE=ROOT/'.cache'
CACHE.mkdir(exist_ok=True)
for filename,remote in [('vanilla-worldmaparea.csv','worldmaparea.csv'),('vanilla-map-license','LICENSE')]:
    target=CACHE/filename
    if not target.exists():
        with urlopen(f'{SOURCE}/{remote}',timeout=60) as response: target.write_bytes(response.read())
names=[('艾尔文','Elwynn','elwynn'),('西部荒野','Westfall','westfall'),('丹莫罗','DunMorogh','dun-morogh'),('洛克莫丹','LochModan','loch-modan'),('赤脊山','Redridge','redridge-mountains'),('暮色森林','Duskwood','duskwood'),('湿地','Wetlands','wetlands'),('泰达希尔','Teldrassil','teldrassil'),('黑海岸','Darkshore','darkshore'),('杜隆塔尔','Durotar','durotar'),('莫高雷','Mulgore','mulgore'),('提瑞斯法林地','Tirisfal','tirisfal-glades'),('银松森林','Silverpine','silverpine-forest'),('贫瘠之地','Barrens','barrens'),('石爪山脉','StonetalonMountains','stonetalon-mountains'),('灰谷','Ashenvale','ashenvale'),('希尔斯布莱德丘陵','Hilsbrad','hillsbrad-foothills'),('千针石林','ThousandNeedles','thousand-needles'),('阿拉希高地','Arathi','arathi-highlands'),('凄凉之地','Desolace','desolace'),('荆棘谷','Stranglethorn','stranglethorn-vale'),('荒芜之地','Badlands','badlands'),('悲伤沼泽','SwampOfSorrows','swamp-of-sorrows'),('尘泥沼泽','Dustwallow','dustwallow-marsh'),('奥特兰克山脉','Alterac','alterac-mountains'),('塔纳利斯','Tanaris','tanaris'),('菲拉斯','Feralas','feralas'),('辛特兰','Hinterlands','hinterlands'),('月光林地','Moonglade','moonglade'),('铁炉堡','Ironforge','ironforge'),('达纳苏斯','Darnassis','darnassus'),('奥格瑞玛','Ogrimmar','orgrimmar'),('雷霆崖','ThunderBluff','thunder-bluff'),('幽暗城','Undercity','undercity'),('暴风城','Stormwind','stormwind')]
raw=(ROOT/'.cache/vanilla-worldmaparea.csv').read_bytes()
names.extend([('灼热峡谷','SearingGorge','searing-gorge'),('燃烧平原','BurningSteppes','burning-steppes'),('诅咒之地','BlastedLands','blasted-lands'),('西瘟疫之地','WesternPlaguelands','western-plaguelands'),('东瘟疫之地','EasternPlaguelands','eastern-plaguelands'),('艾萨拉','Aszhara','azshara'),('费伍德森林','Felwood','felwood'),('冬泉谷','Winterspring','winterspring'),('安戈洛环形山','UngoroCrater','ungoro-crater'),('希利苏斯','Silithus','silithus')])
assert hashlib.sha256(raw).hexdigest()=='fc2a2a99e51d755036a0c45ff9e1833465efe7be878db4c5f96dc05b5b2b5ebc','WorldMapArea source hash mismatch'
rows={r['AreaName']:r for r in csv.DictReader(raw.decode().splitlines())}
revision=REVISION
data={'source':f'https://github.com/TheGrayDot/wow-vanilla-world-coords/blob/{revision}/worldmaparea.csv','sha256':hashlib.sha256(raw).hexdigest(),'regions':{}}
for name,key,image in names:
    row=rows[key];path=f'/maps/{image}-classic.jpg'
    assert (ROOT/'apps/web/public'/path.lstrip('/')).exists()
    data['regions'][name]={'name':name,'image':path,'bounds':[float(row[field])for field in ['LocLeft','LocRight','LocTop','LocBottom']]}
(ROOT/'packages/game-data/data/world-map-atlas.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(ROOT/'docs/research/import/world-map-bounds-LICENSE.txt').write_bytes((ROOT/'.cache/vanilla-map-license').read_bytes())
print('Registered',len(names),'original regional maps')
