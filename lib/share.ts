// Self-contained, backend-free report sharing: the whole run is gzip-compressed
// and base64url-encoded into the URL hash, so a link carries its own data. No
// database needed (that's the Supabase roadmap item). A one-char prefix marks
// whether the payload is gzipped ("g") or a plain fallback ("u").

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzip(str: string): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(str) as unknown as BufferSource);
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}
async function gunzip(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes as unknown as BufferSource);
  writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(buf);
}

const hasCompression = typeof CompressionStream !== "undefined";

export async function encodeShare(data: unknown): Promise<string> {
  const json = JSON.stringify(data);
  if (hasCompression) {
    try {
      return "g" + bytesToB64url(await gzip(json));
    } catch {
      /* fall through */
    }
  }
  return "u" + bytesToB64url(new TextEncoder().encode(json));
}

export async function decodeShare<T = unknown>(token: string): Promise<T | null> {
  try {
    const mark = token[0];
    const body = token.slice(1);
    const bytes = b64urlToBytes(body);
    const json = mark === "g" ? await gunzip(bytes) : new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
