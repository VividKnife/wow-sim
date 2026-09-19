// Scope every game request to the URL's save, including replay and workshop.
// No shared cookie/localStorage selection: multiple tabs can play different saves.
export function saveFetch(input:string,init?:RequestInit){
 const url=new URL(input,window.location.origin);
 const saveId=new URLSearchParams(window.location.search).get('saveId');
 if(saveId)url.searchParams.set('saveId',saveId);
 return fetch(url.pathname+url.search,init);
}
