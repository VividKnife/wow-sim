import {isIP} from 'node:net';

// Only enable trusted hops behind an ingress that appends/overwrites XFF.
// Read from the trusted (right) end, never attacker-prepended addresses.
export function clientAddress(request: Request, hops = Number(process.env.AUTH_TRUST_PROXY_HOPS || 1)) {
  if (!Number.isSafeInteger(hops) || hops < 1) throw new Error('AUTH_TRUST_PROXY_HOPS must be a positive integer');
  const chain = request.headers.get('x-forwarded-for')?.split(',').map(value => value.trim()) ?? [];
  const address = chain.at(-hops);
  if (!address || !isIP(address)) throw new Error('Trusted ingress client address missing');
  return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;
}
