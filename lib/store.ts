import "server-only";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Where experiments and their normalised clips live: Google Cloud Storage in production (keyless, via
 * Vercel OIDC → workload identity federation; see gcsToken), a local .data folder in development.
 */
const LOCAL = path.join(process.cwd(), ".data");

let token: { value: string; exp: number } | null = null;

async function vercelOidcToken(): Promise<string> {
  try {
    const mod = (await import("@vercel/oidc").catch(() => null)) as { getVercelOidcToken?: () => Promise<string> } | null;
    if (mod?.getVercelOidcToken) return await mod.getVercelOidcToken();
  } catch {
    /* fall through */
  }
  const t = process.env.VERCEL_OIDC_TOKEN;
  if (!t) throw new Error("VERCEL_OIDC_TOKEN is not set");
  return t;
}

async function gcsToken(): Promise<string> {
  if (token && token.exp - 300 > Date.now() / 1000) return token.value;
  const r = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience: process.env.GCS_WIF_AUDIENCE,
      scope: "https://www.googleapis.com/auth/devstorage.read_write",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      subjectToken: await vercelOidcToken(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`GCS federation: HTTP ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Math.floor(Date.now() / 1000) + j.expires_in };
  return token.value;
}

const bucket = () => process.env.GCS_BUCKET;

export async function putObject(key: string, body: Uint8Array | string, contentType: string) {
  const b = bucket();
  if (!b) {
    const f = path.join(LOCAL, key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
    return;
  }
  const q = new URLSearchParams({ uploadType: "media", name: key });
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(b)}/o?${q}`, {
    method: "POST",
    headers: { authorization: `Bearer ${await gcsToken()}`, "content-type": contentType },
    body: typeof body === "string" ? body : new Blob([body as BlobPart]),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`GCS write ${key}: HTTP ${r.status}`);
}

export async function getObject(key: string): Promise<Uint8Array | null> {
  const b = bucket();
  if (!b) {
    try {
      return new Uint8Array(await readFile(path.join(LOCAL, key)));
    } catch {
      return null;
    }
  }
  const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(b)}/o/${encodeURIComponent(key)}?alt=media`, {
    headers: { authorization: `Bearer ${await gcsToken()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GCS read ${key}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Starts a resumable upload the browser finishes itself (the session URL is the only capability it gets). */
export async function startResumableUpload(key: string, contentType: string, origin: string): Promise<string | null> {
  const b = bucket();
  if (!b) return null;
  const q = new URLSearchParams({ uploadType: "resumable", name: key });
  const r = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(b)}/o?${q}`, {
    method: "POST",
    headers: { authorization: `Bearer ${await gcsToken()}`, "content-type": "application/json", "x-upload-content-type": contentType, origin },
    body: JSON.stringify({ name: key, contentType }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`GCS resumable: HTTP ${r.status}`);
  return r.headers.get("location");
}

export async function listKeys(prefix: string): Promise<string[]> {
  const b = bucket();
  if (!b) {
    try {
      return (await readdir(path.join(LOCAL, prefix))).map((f) => `${prefix}${f}`);
    } catch {
      return [];
    }
  }
  const q = new URLSearchParams({ prefix, fields: "items(name)", maxResults: "500" });
  const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(b)}/o?${q}`, { headers: { authorization: `Bearer ${await gcsToken()}` }, cache: "no-store" });
  if (!r.ok) return [];
  const j = (await r.json()) as { items?: { name: string }[] };
  return (j.items ?? []).map((i) => i.name);
}
