export type MapTravelerMode='idle'|'walking'|'riding'|'flying';

function Walker(){
 return <svg className="map-traveler-art map-traveler-walker" viewBox="0 0 48 48" aria-hidden="true">
  <ellipse className="traveler-shadow" cx="24" cy="43" rx="11" ry="2.5"/>
  <g className="traveler-bob">
   <path className="traveler-cloak" d="M19 19h10l4 17-9 4-10-4z"/>
   <path className="traveler-pack" d="M14 21h7v12h-7z"/>
   <path className="traveler-limb traveler-arm-back" d="M18 23l-6 10"/>
   <path className="traveler-limb traveler-leg-back" d="M22 35l-6 8"/>
   <path className="traveler-limb traveler-leg-front" d="M27 35l6 8"/>
   <path className="traveler-tunic" d="M19 20h10l2 17H17z"/>
   <path className="traveler-belt" d="M17.8 31h12.8"/>
   <path className="traveler-limb traveler-arm-front" d="M29 23l6 10"/>
   <rect className="traveler-neck" x="22" y="16" width="5" height="5"/>
   <circle className="traveler-face" cx="24.5" cy="12" r="6"/>
   <path className="traveler-hair" d="M18.5 12c0-5 3-7 7-7 4 0 6 3 6 7l-3-3-2 2-3-3-5 5z"/>
  </g>
 </svg>;
}

function Rider(){
 return <svg className="map-traveler-art map-traveler-rider" viewBox="0 0 64 48" aria-hidden="true">
  <ellipse className="traveler-shadow" cx="32" cy="44" rx="22" ry="2.8"/>
  <g className="horse-gallop">
   <path className="horse-tail" d="M13 27Q5 23 7 34"/>
   <path className="horse-body" d="M13 25c4-6 21-7 30-2l7-8 7 3-4 12-10 4H19c-5 0-8-4-6-9z"/>
   <path className="horse-mane" d="M44 22l5-10 7 4-5 3 3 2-4 2 2 3-5 2z"/>
   <path className="horse-ear" d="M52 15l1-6 4 6M48 14l-1-5 4 4"/>
   <circle className="horse-eye" cx="55" cy="18" r="1.2"/>
   <path className="horse-rein" d="M54 21Q44 24 36 17"/>
   <path className="horse-leg horse-leg-back-a" d="M20 32l-5 11"/>
   <path className="horse-leg horse-leg-back-b" d="M28 32l4 11"/>
   <path className="horse-leg horse-leg-front-a" d="M40 31l-3 12"/>
   <path className="horse-leg horse-leg-front-b" d="M46 29l7 12"/>
   <g className="rider-bob">
    <path className="rider-boot" d="M34 27l7 8"/>
    <path className="rider-cloak" d="M27 14h10l5 15-15-3z"/>
    <path className="rider-arm" d="M36 17l7 7"/>
    <circle className="traveler-face" cx="31" cy="8" r="5"/>
    <path className="traveler-hair" d="M26 8c0-5 3-6 6-6 4 0 6 3 5 7l-3-3-3 2-2-2z"/>
   </g>
  </g>
 </svg>;
}

function Flyer(){
 return <svg className="map-traveler-art map-traveler-flyer" viewBox="0 0 64 48" aria-hidden="true">
  <ellipse className="traveler-shadow" cx="32" cy="44" rx="15" ry="2"/>
  <g className="flyer-bob">
   <path className="flyer-wing flyer-wing-back" d="M29 24Q10 10 5 20q9 1 17 13z"/>
   <path className="flyer-wing flyer-wing-front" d="M35 24Q54 10 59 20q-9 1-17 13z"/>
   <path className="flyer-body" d="M22 26q10-9 20 0l-5 12H27z"/>
   <path className="flyer-tail" d="M28 35l-9 7 13-2 4 2 9-7z"/>
   <circle className="traveler-face" cx="32" cy="13" r="5"/>
   <path className="traveler-hair" d="M27 13c0-5 3-6 6-6 4 0 6 3 5 7l-3-3-3 2-2-2z"/>
   <path className="rider-cloak" d="M27 19h10l4 12H24z"/>
  </g>
 </svg>;
}

const labels:Record<MapTravelerMode,string>={idle:'你在这里',walking:'步行中',riding:'骑马中',flying:'飞行中'};

export default function MapTraveler({mode}:{mode:MapTravelerMode}){
 return <div className={`map-player map-traveler mode-${mode}${mode==='idle'?'':' is-moving'}`} role="img" aria-label={`玩家位置：${labels[mode]}`} data-travel-mode={mode}>
  <b>{labels[mode]}</b>
  <span className="map-traveler-stage">{mode==='riding'?<Rider/>:mode==='flying'?<Flyer/>:<Walker/>}</span>
 </div>;
}
