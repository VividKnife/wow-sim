/** Pure availability calculation shared by the authoritative rules and UI.
 * Only purchased rows need storage; elapsed batches refill to capacity once,
 * including after offline time. Viewing or changing tabs never resets stock. */
export function marketAvailability(stock, clock, offer) {
 const record=stock?.[offer.id];
 const restockAt=record?record.restockAt+Math.max(0,Math.floor((clock-record.restockAt)/offer.restockMs)+1)*offer.restockMs:(Math.floor(clock/offer.restockMs)+1)*offer.restockMs;
 return {available:record&&record.restockAt>clock?Math.max(0,offer.capacity-record.purchased):offer.capacity,restockAt:record&&record.restockAt>clock?record.restockAt:restockAt};
}
