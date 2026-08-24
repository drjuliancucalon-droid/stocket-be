// JWT HS256 implementado con Web Crypto API nativa
// Compatible con Cloudflare Workers runtime (sin dependencias externas)

export type JwtPayload = {
  sub: string;
  email: string;
  org_id: string;
  org_role: 'admin' | 'member';
  is_super_admin: boolean;
  exp: number;
};

function base64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(input: string): Uint8Array {
  const padded =
    input.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((input.length + 3) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signJwt(
  payload: Omit<JwtPayload, 'exp'>,
  secret: string,
  expiresInSeconds = 60 * 60 * 24 * 7
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const full: JwtPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(full))}`;
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  );
  return `${data}.${base64url(signature)}`;
}

export async function verifyJwt(
  token: string,
  secret: string
): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encHeader, encPayload, encSignature] = parts;
  const data = `${encHeader}.${encPayload}`;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64urlDecode(encSignature),
    new TextEncoder().encode(data)
  );
  if (!valid) return null;
  const payload: JwtPayload = JSON.parse(
    new TextDecoder().decode(base64urlDecode(encPayload))
  );
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
