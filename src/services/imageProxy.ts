import { ApiInputError } from './apiValidation.ts';
import { serverFetch } from './serverTransport.ts';

// Only publisher-controlled image hosts used by the configured news feeds.
// No user-supplied host, IP literal, subdomain wildcard, or redirect is accepted.
const NEWS_IMAGE_HOSTS = new Set([
  'i.aktuality.sk', 'img.aktuality.sk', 'ipravda.sk', 'static.pravda.sk',
  'i.sme.sk', 'image.sme.sk', 'cdn.sme.sk', 'static.sme.sk', 'm.smedata.sk',
  'ichef.bbci.co.uk', 'news.bbcimg.co.uk',
  'i.guim.co.uk',
]);

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export class ImageProxyError extends Error {
  constructor(message: string, readonly status: 400 | 502 | 503 = 502) { super(message); }
}

export function validateNewsImageUrl(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2048) throw new ApiInputError('Neplatná adresa obrázka.');
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiInputError('Neplatná adresa obrázka.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !NEWS_IMAGE_HOSTS.has(url.hostname)) {
    throw new ApiInputError('Zdroj obrázka nie je povolený.');
  }
  return url;
}

export function hasExpectedImageSignature(body: Uint8Array, contentType: string): boolean {
  const ascii = (start: number, end: number) => Buffer.from(body.subarray(start, end)).toString('ascii');
  switch (contentType) {
    case 'image/jpeg': return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
    case 'image/png': return body.length >= 8 && Buffer.from(body.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'image/gif': return body.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
    case 'image/webp': return body.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'image/avif': return body.length >= 16 && ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, Math.min(body.length, 32)));
    default: return false;
  }
}

export async function fetchNewsImage(value: unknown, signal?: AbortSignal): Promise<{ body: Buffer; contentType: string }> {
  const url = validateNewsImageUrl(value);
  const upstream = await serverFetch(url, {
    signal,
    timeoutMs: 6000,
    maxBytes: MAX_IMAGE_BYTES,
    publicAddressOnly: true,
    redirect: 'error',
    headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
  });
  if (!upstream.ok) throw new ImageProxyError('Obrázok sa nepodarilo načítať.');
  const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new ImageProxyError('Obrázok je príliš veľký.');
  const body = Buffer.from(await upstream.arrayBuffer());
  if (body.length > MAX_IMAGE_BYTES) throw new ImageProxyError('Obrázok je príliš veľký.');
  if (!hasExpectedImageSignature(body, contentType)) throw new ImageProxyError('Zdroj neposkytol povolený rastrový obrázok.');
  return { body, contentType };
}
