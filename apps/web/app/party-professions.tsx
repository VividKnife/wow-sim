import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Icon} from './game-ui';
import styles from './party.module.css';

const icons:Record<string,string>={herbalism:'spell_nature_naturetouchgrow',mining:'trade_mining',skinning:'inv_misc_pelt_01',fishing:'trade_fishing',alchemy:'trade_alchemy',blacksmithing:'trade_blacksmithing',leatherworking:'trade_leatherworking',tailoring:'trade_tailoring',engineering:'trade_engineering',enchanting:'trade_engraving',cooking:'inv_misc_food_15',firstaid:'spell_holy_sealofsacrifice'};
type Profession={id:string;name:string;kind:string;description:string};
function ProfessionIcon({id,size=36}:{id:string;size?:number}){return <Icon src={`/icons/assets/${icons[id]}.png`} name="生活职业" size={size}/>;}

export default function PartyProfessions({professions,values,onChange,disabled}:{professions:Profession[];values:[string,string];onChange:(index:number,value:string)=>void;disabled:boolean}){
 return <div className={styles.professionSetup}>
  <div className={styles.professionHeading}><div><h3>伙伴的生活职业</h3><p>选择两项不同的专长，陪伴小队一路成长。</p></div><span>初始熟练度 <b>75</b></span></div>
  <div className={styles.professionGrid}>{values.map((value,index)=>{const selected=professions.find(p=>p.id===value);return <div key={index} className={styles.professionCard}>
   <span className={styles.professionLabel}>生活职业 {index+1}<small>{selected?.kind}</small></span>
   <Select value={value} disabled={disabled} onValueChange={next=>onChange(index,next)}><SelectTrigger className={styles.professionTrigger} aria-label={`队友生活职业${index+1}`}><SelectValue><span className={styles.professionIdentity}><ProfessionIcon id={value}/><strong>{selected?.name}</strong></span></SelectValue></SelectTrigger>
    <SelectContent className={styles.professionMenu} position="popper" align="start">{professions.map(p=><SelectItem key={p.id} value={p.id} textValue={p.name} disabled={p.id===values[1-index]} className={styles.professionOption}><span className={styles.professionIdentity}><ProfessionIcon id={p.id} size={28}/><span><strong>{p.name}</strong><small>{p.id===values[1-index]?'另一项已选择':p.description}</small></span></span></SelectItem>)}</SelectContent>
   </Select>
   <p>{selected?.description}</p>
  </div>;})}</div>
  <p className={styles.professionFootnote}>入队即掌握该阶段配方 · 两项专业均从 75 点开始</p>
 </div>;
}
