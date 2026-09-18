// Simulation clocks can be rebased; anchor event times to the current wall clock.
export function journeyTime(at, state, timeZone) {
 if (![at, state.clock, state.wallAt].every(Number.isFinite)) return {label:'—',dateTime:undefined};
 const date=new Date(state.wallAt+(at-state.clock));
 if (!Number.isFinite(date.getTime())) return {label:'—',dateTime:undefined};
 return {
  label:new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',...(timeZone?{timeZone}:{})}).format(date),
  dateTime:date.toISOString(),
 };
}
