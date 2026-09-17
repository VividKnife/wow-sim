// Level-interpolated Classic reference coefficients. The pinned source and
// its remaining validation caveats are recorded in combat-rules.md.
export function agilityChances(classId,level,agility){
 const endpoints={1:[3.9,20],2:[4.6,20],3:[3.5,53],4:[2.2,29],5:[11,20],7:[4.6,20],8:[12.9,20],9:[8.4,20],11:[4.6,20]};
 const [low,high]=endpoints[classId]||[20,20],fraction=(Math.max(1,Math.min(60,level))-1)/59;
 const crit=agility/(low+(high-low)*fraction)/100;
 const dodgeEndpoints=classId===3?[1.8,26.5]:classId===4?[1.1,14.5]:[low,high];
 const base={2:.75,3:.64,5:3,7:1.75,8:3.25,9:2,11:.75}[classId]||0;
 const dodge=(base+agility/(dodgeEndpoints[0]+(dodgeEndpoints[1]-dodgeEndpoints[0])*fraction))/100;
 return {crit,dodge};
}
export function intellectCrit(classId,level,intellect){
 const [base,offset,rate]={2:[3.7,14.77,.65],5:[2.97,10.03,.82],7:[3.54,11.51,.8],8:[3.7,14.77,.65],9:[3.18,11.3,.82],11:[3.33,12.41,.79]}[classId]||[0,0,10];
 return (base+intellect/(offset+rate*Math.max(1,level)))/100;
}
export function baseAttackPower(classId,level,strength,agility,form){
 const attackPower=[3,4].includes(classId)?strength+agility+2*level-20:[5,8,9].includes(classId)?strength-10:2*strength+(classId===7?2:3)*level-20+(form==='cat'?agility:0);
 const rangedAttackPower=classId===3?2*level+2*agility-10:[1,4].includes(classId)?level+agility-10:classId===11&&['cat','bear','direbear'].includes(form)?0:agility-10;
 return {attackPower,rangedAttackPower};
}
