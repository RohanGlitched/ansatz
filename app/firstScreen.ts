import "server-only";
import { getExperiment } from "@/lib/experiments";
import { headline } from "@/lib/headline";
import { fou5Of } from "@/lib/fou5";
import { sealedTest } from "./sealed";
import { strangersTally, strangersWord } from "./proof/strangers";

/**
 * The first screen's three results and the sealed-law line, read from the stored runs (never typed): the Apollo copy
 * slowed in secret, timed jump for jump; the museum film its maker sped up, read as a clock; the stranger's pendulum in
 * Aachen. The home page shows them as tiles; /judges quotes the same figures in its 60-second card.
 */
export type ResultTile = {
  key: string;
  /** what the clip is, in a few words */
  kicker: string;
  value: string;
  pm?: string;
  unit?: string;
  /** what the number is */
  what: string;
  truth: string;
  /** one more checkable figure, shown on wide screens */
  extra?: string;
  /** the one descriptor a phone keeps (wide screens show `what` and `extra` instead) */
  brief: string;
  href: string;
  go: string;
};

export type FirstScreen = {
  tiles: ResultTile[];
  /** the sealed test's computed headline (app/sealed.ts): what was found, the driven laws, the drive and who wrote it, the
   * budget, the replicate; `drives` is the short form for places with one clause of room */
  sealed: { n: number; found: number; driven: number; drivenFound: number; drives: string; /** the drive over every driven draw, and who wrote each winning one */ driveText: string; text: string; short: string } | null;
};

export async function firstScreen(): Promise<FirstScreen> {
  const get = (id: string) => getExperiment(id).catch(() => null);
  const [hl, moon, fast, real, aachen, sealed] = await Promise.all([headline(), get("moon-jump"), get("foucault-pendulum-5x"), get("foucault-pendulum"), get("aachen-pendulum-50cm"), sealedTest().catch(() => null)]);
  const tiles: ResultTile[] = [];

  const st = moon?.extras?.speedTest;
  const clipB = st?.repeats?.clips.find((c) => c.clip === "B");
  if (hl.jumpForJump && st) {
    const realCalls = clipB ? clipB.answers.filter((x) => x.real_speed).length : null;
    tiles.push({
      key: "apollo",
      kicker: "Apollo 16, slowed in secret",
      value: hl.jumpForJump.ratio.toFixed(3),
      pm: hl.jumpForJump.sigma.toFixed(3),
      unit: "×",
      what: "slower, timed jump for jump against the 1972 broadcast",
      truth: `${st.truth}×`,
      extra: realCalls != null && st.repeats ? `Muse Spark, by eye: “real speed” ${realCalls} of ${st.repeats.n}` : undefined,
      brief: "slower than the 1972 broadcast",
      href: "/x/moon-jump#same-jump",
      go: "How it was timed",
    });
  }

  const f5 = fou5Of(fast, real);
  if (f5) {
    tiles.push({
      key: "museum",
      kicker: "A museum film its maker sped up",
      value: f5.f.toFixed(2),
      unit: "×",
      what: "faster than life, read with gravity as a clock",
      truth: `${+f5.truth.toPrecision(3)}×`,
      extra: f5.period ? `With no law, from the swing’s period: ${f5.period.speedup.toFixed(3)}×` : undefined,
      brief: "faster than life",
      href: "/x/foucault-pendulum-5x",
      go: "Open the run",
    });
  }

  const g = aachen?.comparisons.find((c) => c.param === "g");
  // the denominator: this is one of the strangers' clips that measured, out of every one we ran (app/proof/strangers.ts)
  const st16 = strangersTally();
  const ofAll = `one of ${strangersWord(st16.measured)} measured in ${st16.n} strangers’ clips`;
  if (g) {
    tiles.push({
      key: "aachen",
      kicker: "A stranger’s pendulum, Aachen",
      value: g.measured.toFixed(2),
      pm: g.sigma.toFixed(2),
      unit: "m/s²",
      what: "g, told only “about fifty centimetres”",
      truth: `${g.reference.toFixed(3)} m/s²`,
      extra: `${Math.abs(g.errorPct).toFixed(2)}% from Earth’s gravity; ${ofAll}`,
      brief: `g; ${ofAll}`,
      href: "/x/aachen-pendulum-50cm",
      go: "Open the run",
    });
  }

  let line: FirstScreen["sealed"] = null;
  if (sealed) {
    const driven = sealed.sets.reduce((t, s) => t + s.driven, 0);
    const drivenFound = sealed.sets.reduce((t, s) => t + s.drivenFound, 0);
    const drives = drivenFound === 0 ? `none of the ${driven} driven ones found in full` : drivenFound === driven ? `all ${driven} driven ones found` : `${drivenFound} of ${driven} driven ones found`;
    // the first screen's own line, under 25 words: the counts and who wrote the drives, nothing qualified (the full headline is on /proof)
    const allUndriven = drivenFound === 0;
    const short = `${sealed.n} laws drawn by public randomness, hashes first: ${sealed.found} found${sealed.found ? (allUndriven ? ", all undriven" : `, ${drivenFound} of them driven`) : ""}; ${sealed.drive.short || "every miss published"}.`;
    line = { n: sealed.n, found: sealed.found, driven, drivenFound, drives, driveText: sealed.drive.text, text: sealed.headline.replace(/\.$/, ""), short };
  }
  return { tiles, sealed: line };
}
