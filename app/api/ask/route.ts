import { crossOrigin, sameOrigin } from "@/lib/origin";
import { getExperiment, winnerOf } from "@/lib/experiments";
import { addSpend, DAILY_USD, spentToday, visitorOf } from "@/lib/limits";
import { Ledger, outputText, respond } from "@/lib/meta/client";
import { updateJson } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_VISITOR = 15;
const nums = (s: string) => [...s.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

/** Muse Spark answers a question about one experiment from its stored record; numbers it quotes are checked against it. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossOrigin();
  const { id = "", question = "" } = (await req.json().catch(() => ({}))) as { id?: string; question?: string };
  const q = String(question).trim().slice(0, 400);
  if (!q) return Response.json({ error: "Ask a question." }, { status: 400 });
  const e = await getExperiment(String(id));
  if (!e) return Response.json({ error: "No such experiment." }, { status: 404 });
  const today = new Date().toISOString().slice(0, 10), who = visitorOf(req);
  const ok = await updateJson<Record<string, number>>(`usage/ask-${today}.json`, {}, (d) => ((d[who] ?? 0) >= PER_VISITOR ? null : { ...d, [who]: (d[who] ?? 0) + 1 })).catch(() => null);
  if (!ok) return Response.json({ error: `That's ${PER_VISITOR} questions today; the limit resets at midnight UTC.` }, { status: 429 });
  if ((await spentToday()) >= DAILY_USD) return Response.json({ error: "Today's allowance of Meta credits is spent. Try again tomorrow." }, { status: 429 });

  const w = winnerOf(e);
  const record = {
    experiment: e.title,
    what_happens: e.observation.what_happens,
    world: e.observation.body,
    scale: e.measured.calibration.note,
    given: e.given,
    winning_law: { title: w.law.title, equations: w.law.derivatives, constants: Object.fromEntries(w.law.params.filter((p) => !p.fixed && p.name !== "cal").map((p) => [p.name, { value: +w.fit.theta[p.name].toPrecision(4), sigma: +(w.fit.sigma[p.name] ?? 0).toPrecision(2), unit: p.unit, meaning: p.meaning }])) },
    trial: e.candidates.map((c) => ({ rank: c.rank, law: c.law.title, by: c.origin, unseen_miss: +c.fit.testRms.toPrecision(3), seen_miss: +c.fit.trainRms.toPrecision(3), noise_units_unseen: c.fit.testZ != null ? +c.fit.testZ.toPrecision(3) : null })),
    compared_with: e.comparisons.map((c) => ({ quantity: c.param, measured: +c.measured.toPrecision(4), sigma: +c.sigma.toPrecision(2), reference: c.reference, label: c.label })),
    clock: e.clock
      ? { slower_by: +e.clock.factor.toPrecision(3), note: e.clock.note }
      : e.comparisons.some((c) => c.param === "g" || /gravity|accelerates at g/i.test(c.label))
        ? `checked: the measured gravity agrees with ${e.comparisons[0].label}, so no slow motion was found (gravity would come out weaker by the square of any slowdown)`
        : "not checked (no gravity was measured against a ruler)",
    speed_test: e.extras?.speedTest
      ? { note: "the same clip slowed 1.5× in secret was measured too", slowed_clip_accel: e.extras.memoryTest?.rows[1]?.g, measured_slowdown_of_slowed_clip: e.extras.memoryTest ? +Math.sqrt(e.extras.memoryTest.rows[0].g / e.extras.memoryTest.rows[1].g).toFixed(2) : null }
      : undefined,
    finding: e.finding,
  };
  const ledger = new Ledger();
  const r = await respond(
    {
      model: "muse-spark-1.3",
      reasoning: { effort: "low" },
      max_output_tokens: 3000,
      instructions: "You answer questions about one physics experiment measured by Ansatz, using only its record below. Quote numbers only as they appear in the record, with their uncertainties. If the record can't answer, say what would be needed. At most 120 words, plain sentences.",
      input: [{ role: "user", content: [{ type: "input_text", text: `Record:\n${JSON.stringify(record)}\n\nQuestion: ${q}` }] }],
    },
    ledger,
    "ask about a run",
  ).catch(() => null);
  if (!r) return Response.json({ error: "Muse Spark didn't answer just now. Try again." }, { status: 502 });
  await addSpend(ledger.usd).catch(() => {});
  const answer = outputText(r).trim();
  // every number in the answer must be one the record holds (allowing for rounding); otherwise say so
  const have = nums(JSON.stringify(record));
  const unknown = nums(answer).filter((n) => !have.some((h) => Math.abs(h - n) <= Math.max(0.005 * Math.abs(h), 0.051)));
  return Response.json({ answer, unchecked: unknown.length ? unknown : undefined, usd: +ledger.usd.toFixed(4) });
}
