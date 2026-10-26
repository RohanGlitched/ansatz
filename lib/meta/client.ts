/**
 * Meta Model API over plain fetch: the Responses endpoint (JSON and streamed), the Files API, and the
 * speech-to-text endpoint. Every call adds its usage to a per-run ledger, so each experiment page can say
 * what it cost to run.
 */

export const META_BASE = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";

function key() {
  const k = process.env.META_API_KEY ?? process.env.MODEL_API_KEY;
  if (!k) throw new Error("META_API_KEY is not set");
  return k.trim().replace(/^"|"$/g, "");
}

/** USD per 1M tokens (input, cached input, output) and per-unit prices, from dev.meta.ai/docs/pricing-rate-limits. */
export const PRICE = {
  "muse-wonder-1.0": { in: 4.0, cached: 0.2, out: 20.0 },
  "muse-spark-1.3": { in: 1.25, cached: 0.15, out: 4.25 },
  "muse-spark-1.2": { in: 1.25, cached: 0.15, out: 4.25 },
  "muse-spark-1.3-contributor": { in: 0.1, cached: 0.002, out: 0.2 },
  samFrame: 0.2 / 1000,
  samImage: 2.5 / 1000,
  transcribeHour: 0.18,
} as const;

export type Call = {
  model: string;
  purpose: string;
  ms: number;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  frames?: number;
  audioSeconds?: number;
  usd: number;
};

export class Ledger {
  calls: Call[] = [];
  add(c: Call) {
    this.calls.push(c);
  }
  get usd() {
    return this.calls.reduce((s, c) => s + c.usd, 0);
  }
  get tokens() {
    return this.calls.reduce((s, c) => s + (c.inputTokens ?? 0) + (c.outputTokens ?? 0), 0);
  }
}

export class MetaError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message);
  }
}

async function metaFetch(path: string, init: RequestInit & { timeoutMs?: number }, tries = 4): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${META_BASE}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${key()}`, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(init.timeoutMs ?? 240_000),
      });
      if (r.status === 429 || r.status >= 500) {
        last = new MetaError(`Meta API ${r.status}`, r.status, (await r.text()).slice(0, 400));
        await new Promise((res) => setTimeout(res, 1200 * (i + 1) + Math.random() * 600));
        continue;
      }
      // measured on Oct 27: the API sometimes answers a valid request with 404 model_not_found, then 200 on retry
      if (r.status === 404 && i < tries - 1) {
        const body = await r.clone().text();
        if (body.includes("model_not_found")) {
          last = new MetaError(`Meta API 404 model_not_found`, 404, body.slice(0, 400));
          await new Promise((res) => setTimeout(res, 1500 * (i + 1) + Math.random() * 800));
          continue;
        }
      }
      return r;
    } catch (e) {
      last = e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function uploadFile(bytes: Uint8Array, filename: string, mime: string, expiresSeconds = 6 * 3600): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: mime }), filename);
  form.append("purpose", "user_data");
  form.append("expires_after[anchor]", "created_at");
  form.append("expires_after[seconds]", String(Math.max(3600, expiresSeconds)));
  const r = await metaFetch("/files", { method: "POST", body: form, timeoutMs: 300_000 });
  if (!r.ok) {
    const body = await r.text();
    throw new MetaError(`upload failed: HTTP ${r.status} ${body.slice(0, 200)}`, r.status, body);
  }
  return ((await r.json()) as { id: string }).id;
}

export async function deleteFile(id: string) {
  await metaFetch(`/files/${encodeURIComponent(id)}`, { method: "DELETE" }, 1).catch(() => null);
}

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
};

export type ResponseJson = {
  id: string;
  status?: string;
  output?: { type: string; content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[]; status?: string }[];
  usage?: Usage;
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string } | null;
};

function tokenCost(model: string, u?: Usage) {
  const p = (PRICE as unknown as Record<string, { in: number; cached: number; out: number } | undefined>)[model];
  if (typeof p !== "object") return 0;
  if (!p || !u) return 0;
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  return (((u.input_tokens ?? 0) - cached) * p.in + cached * p.cached + (u.output_tokens ?? 0) * p.out) / 1e6;
}

/** POST /v1/responses (non-streaming) and log its usage. */
export async function respond(body: Record<string, unknown>, ledger: Ledger | null, purpose: string): Promise<ResponseJson> {
  const t = Date.now();
  const r = await metaFetch("/responses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new MetaError(`${purpose}: HTTP ${r.status} ${text.slice(0, 300)}`, r.status, text);
  const j = JSON.parse(text) as ResponseJson;
  const model = String(body.model);
  ledger?.add({
    model,
    purpose,
    ms: Date.now() - t,
    inputTokens: j.usage?.input_tokens,
    cachedTokens: j.usage?.input_tokens_details?.cached_tokens,
    outputTokens: j.usage?.output_tokens,
    reasoningTokens: j.usage?.output_tokens_details?.reasoning_tokens,
    usd: tokenCost(model, j.usage),
  });
  return j;
}

export function outputText(j: ResponseJson): string {
  return (j.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
}

export function citations(j: ResponseJson): { url: string; title: string }[] {
  const seen = new Map<string, string>();
  for (const o of j.output ?? []) for (const c of o.content ?? []) for (const a of c.annotations ?? []) if (a.type === "url_citation" && a.url && !seen.has(a.url)) seen.set(a.url, a.title ?? a.url);
  return [...seen].map(([url, title]) => ({ url, title }));
}

/** Structured output on the Responses API: the decoder is constrained to the schema. */
export async function respondJson<T>(
  args: { model: string; input: unknown; schema: Record<string, unknown>; name: string; effort?: string; maxOutput?: number; tools?: unknown[]; instructions?: string },
  ledger: Ledger | null,
  purpose: string,
): Promise<{ value: T; raw: ResponseJson }> {
  let raw: ResponseJson;
  try {
    raw = await respondOnce(args, args.model, ledger, purpose);
  } catch (e) {
    // a model that keeps answering "not found" falls back to its sibling for this call only
    const fallback = FALLBACK[args.model];
    if (!(e instanceof MetaError) || e.status !== 404 || !fallback) throw e;
    raw = await respondOnce(args, fallback, ledger, `${purpose} (on ${fallback})`);
  }
  const parsed = parseJsonLoose<T>(outputText(raw));
  if (parsed !== undefined) return { value: parsed, raw };
  // With a tool enabled the model sometimes answers in prose; ask again without tools, decoder-constrained.
  if (args.tools?.length) return respondJson<T>({ ...args, tools: undefined }, ledger, `${purpose} (retry)`);
  throw new Error(`${purpose}: the model did not return JSON (${raw.incomplete_details?.reason ?? raw.status ?? "unknown"})`);
}

const FALLBACK: Record<string, string> = { "muse-spark-1.3": "muse-spark-1.2", "muse-wonder-1.0": "muse-spark-1.3" };

function respondOnce(
  args: { model: string; input: unknown; schema: Record<string, unknown>; name: string; effort?: string; maxOutput?: number; tools?: unknown[]; instructions?: string },
  model: string,
  ledger: Ledger | null,
  purpose: string,
) {
  return respond(
    {
      model,
      input: args.input,
      ...(args.instructions ? { instructions: args.instructions } : {}),
      reasoning: { effort: args.effort ?? "low" },
      max_output_tokens: args.maxOutput ?? 16000,
      text: { format: { type: "json_schema", name: args.name, schema: args.schema, strict: false } },
      ...(args.tools ? { tools: args.tools } : {}),
    },
    ledger,
    purpose,
  );
}

export function parseJsonLoose<T>(text: string): T | undefined {
  const txt = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  if (!txt) return undefined;
  try {
    return JSON.parse(txt) as T;
  } catch {
    const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(txt.slice(a, b + 1)) as T;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

/** POST /v1/responses with stream: true; returns the concatenated output_text (SAM's wire lines). */
export async function respondStreamText(body: Record<string, unknown>, ledger: Ledger | null, purpose: string, onDelta?: (d: string) => void): Promise<string> {
  const t = Date.now();
  const r = await metaFetch("/responses", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ ...body, stream: true }) });
  if (!r.ok || !r.body) {
    const text = await r.text();
    throw new MetaError(`${purpose}: HTTP ${r.status} ${text.slice(0, 300)}`, r.status, text);
  }
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  let failure: string | null = null;
  const reader = r.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let ev: { type?: string; delta?: string; message?: string; response?: { error?: { message?: string } } };
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === "response.output_text.delta" && ev.delta) {
        out += ev.delta;
        onDelta?.(ev.delta);
      } else if (ev.type === "response.failed") failure = ev.response?.error?.message ?? "response failed";
      else if (ev.type === "error") failure = ev.message ?? "stream error";
    }
  }
  if (failure) throw new Error(`${purpose}: ${failure}`);
  ledger?.add({ model: String(body.model), purpose, ms: Date.now() - t, usd: 0 });
  return out;
}

export type Transcript = { transcript: string; audioDurationMs: number; turns: { turnId: number; startMs: number; endMs: number; transcript: string; speaker?: string }[] };

/** POST /v1/asr/transcribe: a mono 16/24 kHz WAV, one turn per detected utterance with its time in the clip. */
export async function transcribe(wav: Uint8Array, ledger: Ledger | null, opts: { keywords?: string[]; languages?: string[] } = {}): Promise<Transcript> {
  const t = Date.now();
  const form = new FormData();
  const request = {
    model: "muse-voice-transcribe-1.0",
    audioEncoding: "WAV",
    mode: "ENDPOINTING",
    ...(opts.keywords?.length ? { keywords: opts.keywords.slice(0, 50) } : {}),
    ...(opts.languages?.length ? { languageBias: opts.languages } : {}),
  };
  form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
  form.append("audio", new Blob([wav as BlobPart], { type: "audio/wav" }), "narration.wav");
  const r = await metaFetch("/asr/transcribe", { method: "POST", body: form, headers: { accept: "application/json" }, timeoutMs: 120_000 });
  const text = await r.text();
  if (!r.ok) throw new MetaError(`transcribe: HTTP ${r.status} ${text.slice(0, 300)}`, r.status, text);
  const j = JSON.parse(text) as Transcript;
  const sec = (j.audioDurationMs ?? 0) / 1000;
  ledger?.add({ model: "muse-voice-transcribe-1.0", purpose: "narration", ms: Date.now() - t, audioSeconds: sec, usd: (sec / 3600) * PRICE.transcribeHour });
  return j;
}
