// Fit the whole mounted model in a 45-degree camera, including its depth.
// The upstream portrait camera pans by height and assumes a horizontal view;
// applying that pan after tilting pushes the mount out of the bottom of frame.
export function worldCamera(bounds,aspect){
 const [min,max]=bounds;
 const center=min.map((value,index)=>(value+max[index])/2);
 const half=min.map((value,index)=>(max[index]-value)/2);
 const azimuth=Math.PI/2+.18,zenith=3*Math.PI/4;
 const a=Math.sin(azimuth),b=Math.cos(azimuth),c=Math.cos(zenith),d=Math.sin(zenith);
 const horizontal=Math.abs(a)*half[0]+Math.abs(b)*half[1];
 const vertical=Math.abs(b*c)*half[0]+Math.abs(a*c)*half[1]+Math.abs(d)*half[2];
 const depth=Math.abs(d*b)*half[0]+Math.abs(d*a)*half[1]+Math.abs(c)*half[2];
 const distance=1.12*(Math.max(vertical,horizontal/Math.max(.1,aspect))/Math.tan(Math.PI/12)+depth);
 return {center,azimuth,zenith,distance:Math.max(1,distance)};
}
