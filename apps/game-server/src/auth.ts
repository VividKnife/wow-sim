const encoder = new TextEncoder();
const audience = 'wow-sim-game';
const maximumTtlSeconds = 300;

export type GameTokenClaims = {
  sub: string;
  iat: number;
  exp: number;
  aud: typeof audience;
};

export type TokenClock = {now?: number; ttlSeconds?: number};

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Malformed game token');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  let binary: string;
  try { binary = atob(padded); } catch { throw new Error('Malformed game token'); }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function requireSecret(secret: string): Uint8Array {
  const bytes = encoder.encode(secret);
  if (bytes.byteLength < 32) throw new Error('GAME_SERVER_SECRET must contain at least 32 bytes');
  return bytes;
}

export function validateGameSecret(secret: string): void {
  requireSecret(secret);
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function hmacKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    bufferSource(requireSecret(secret)),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    usage,
  );
}

function currentSeconds(now?: number): number {
  return now ?? Math.floor(Date.now() / 1_000);
}

export async function signGameToken(
  identity: {sub: string},
  secret: string,
  options: TokenClock = {},
): Promise<string> {
  if (typeof identity.sub !== 'string' || !identity.sub.trim() || identity.sub.length > 200) {
    throw new Error('Game token subject is invalid');
  }
  const ttlSeconds = options.ttlSeconds ?? 60;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > maximumTtlSeconds) {
    throw new Error('Game token lifetime must be between one second and five minutes');
  }
  const iat = currentSeconds(options.now);
  const claims: GameTokenClaims = {sub: identity.sub, iat, exp: iat + ttlSeconds, aud: audience};
  const header = base64Url(encoder.encode(JSON.stringify({alg: 'HS256', typ: 'JWT'})));
  const payload = base64Url(encoder.encode(JSON.stringify(claims)));
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign']), encoder.encode(signingInput));
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

export async function verifyGameToken(
  token: string,
  secret: string,
  options: {now?: number} = {},
): Promise<GameTokenClaims> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('Malformed game token');
  let header: unknown;
  let claims: unknown;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  } catch {
    throw new Error('Malformed game token');
  }
  if (!header || typeof header !== 'object' || (header as any).alg !== 'HS256' || (header as any).typ !== 'JWT') {
    throw new Error('Malformed game token');
  }
  const validSignature = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret, ['verify']),
    bufferSource(decodeBase64Url(parts[2])),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!validSignature) throw new Error('Invalid game token signature');
  if (!claims || typeof claims !== 'object') throw new Error('Malformed game token');
  const value = claims as Partial<GameTokenClaims>;
  if (
    typeof value.sub !== 'string' || !value.sub || value.sub.length > 200 ||
    value.aud !== audience || !Number.isInteger(value.iat) || !Number.isInteger(value.exp) ||
    (value.exp as number) <= (value.iat as number) ||
    (value.exp as number) - (value.iat as number) > maximumTtlSeconds
  ) throw new Error('Malformed game token');
  const now = currentSeconds(options.now);
  if ((value.iat as number) > now + 5) throw new Error('Game token is not active');
  if ((value.exp as number) <= now) throw new Error('Game token expired');
  return value as GameTokenClaims;
}

export async function authenticateAuthorization(value: string | undefined, secret: string): Promise<GameTokenClaims> {
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(value || '');
  if (!match) throw new Error('Missing bearer game token');
  return verifyGameToken(match[1], secret);
}
