import "server-only";
import { getExperiment } from "@/lib/experiments";
import type { Experiment } from "@/lib/experiment";
// bundled with the page, so a revalidation on the server never depends on the file being traced
import gymRun from "@/data/strangers/gym-ball-bounce-240fps-b.json";

/**
 * "Can you tell?": six real clips, each with what Muse Spark said by eye, what Ansatz measured and the truth. Every
 * answer is read from a stored run: the five published records in data/showcase, and the gym ball's second run
 * (data/strangers, copied unchanged from the 2 November probe), which was never published because it missed.
 * The clips themselves are short cuts of the same footage (public/cyt), made with ffmpeg without retiming a frame.
 */
export type Verdict = "real time" | "slowed" | "sped up";

export type CytClip = {
  id: string;
  src: string;
  poster: string;
  /** a credit that names the maker without giving the answer away */
  credit: { who: string; licence: string; href: string };
  /** shown with the answers */
  title: string;
  /** the full credit and how the clip on this page was cut from the run's footage */
  source: { credit: string; licence: string; href: string; cut: string; record: string };
  spark: { verdict: Verdict; said: string; detail?: string };
  /** null when the run could not measure the clock at all */
  ansatz: { verdict: Verdict | null; reading: string; detail?: string; href?: string };
  truth: { verdict: Verdict; factor: string; source: string };
};

export type Cyt = { clips: CytClip[]; spark: number; ansatz: number };

const fmt = (v: number, d = 2) => v.toFixed(d);
const verdictOf = (factor: number): Verdict => (factor > 1 ? "slowed" : factor < 1 ? "sped up" : "real time");

/** What Muse Spark said when it watched the clip: the run's own observation, or for the Moon the five repeats. */
function sparkOf(e: Experiment, repeatClip?: string): CytClip["spark"] {
  const rp = e.extras?.speedTest?.repeats ?? null;
  const c = repeatClip ? rp?.clips.find((x) => x.clip === repeatClip) : undefined;
  if (rp && c) {
    const real = c.answers.filter((a) => a.real_speed).length;
    const slow = c.answers.filter((a) => !a.real_speed);
    const slowF = [...new Set(slow.map((a) => a.factor))];
    return {
      verdict: real * 2 > c.answers.length ? "real time" : "slowed",
      said: `“Real speed”, ${real} of ${c.answers.length} times`,
      detail: slow.length ? `The other ${slow.length}: ${slowF.map((f) => `${f}× slow`).join(" or ")}. Asked the same question ${rp.n} times, shown this clip alone.` : `Asked the same question ${rp.n} times, shown this clip alone.`,
    };
  }
  const sm = e.observation.slow_motion;
  return {
    verdict: sm.factor > 1 ? "slowed" : "real time",
    said: sm.factor > 1 ? `“Slowed ${sm.factor}×”` : "“Real time”",
    detail: `“${sm.evidence.charAt(0).toUpperCase()}${sm.evidence.slice(1).replace(/\.$/, "")}.”`,
  };
}

/** What Ansatz measured: the run's clock check. A flagged clock gives its factor; an unflagged one is real time, and
 * its factor is read from the gravity it measured (time scales as the square root of gravity). */
function ansatzOf(e: Experiment, extra?: string): CytClip["ansatz"] {
  const href = e.source.kind === "showcase" ? `/x/${e.id}` : undefined;
  if (e.clock) {
    const f = e.clock.factor, s = e.clock.sigma;
    if (f < 1) {
      const x = 1 / f, xs = s !== undefined ? s / (f * f) : undefined;
      return { verdict: "sped up", reading: `${fmt(x)}${xs !== undefined ? ` ± ${fmt(xs)}` : ""}× faster than life`, detail: extra ?? "Gravity came out too strong by the square of that.", href };
    }
    return { verdict: "slowed", reading: `${fmt(f)}${s !== undefined ? ` ± ${fmt(s)}` : ""}× slower than life`, detail: extra ?? "Gravity came out too weak by the square of that.", href };
  }
  if (e.clockCheck && !e.clockCheck.checked) {
    return { verdict: null, reading: "Could not measure", detail: extra ?? e.clockCheck.why, href };
  }
  const g = e.comparisons.find((c) => c.param === "g");
  if (!g) return { verdict: "real time", reading: "Real time", detail: extra, href };
  const f = Math.sqrt(g.reference / g.measured), s = 0.5 * f * (g.sigma / g.measured);
  return {
    verdict: "real time",
    reading: `Real time: ${fmt(f)} ± ${fmt(s)}×`,
    detail: extra ?? `g = ${fmt(g.measured)} ± ${fmt(g.sigma)} m/s², against ${g.reference === 1.625 ? "the Moon’s" : "Earth’s"} ${g.reference === 1.625 ? "1.625" : fmt(g.reference)}.`,
    href,
  };
}

export async function canYouTell(): Promise<Cyt | null> {
  const [moon, slowed, fou, fou5, aachen] = await Promise.all(["moon-jump", "moon-jump-slowed", "foucault-pendulum", "foucault-pendulum-5x", "aachen-pendulum-50cm"].map((id) => getExperiment(id).catch(() => null)));
  const gym = gymRun as unknown as Experiment;
  if (!moon || !slowed || !fou || !fou5 || !aachen || !gym) return null;

  const st = moon.extras?.speedTest;
  const sj = moon.extras?.memoryTest?.sameJump?.combined;
  const fouT = fou.extras?.truth?.rows.find((r) => r.param === "T");
  const fou5S = fou5.extras?.truth?.rows.find((r) => r.param === "speedup");
  const gymFps = Math.round(gym.video.fps);
  const gymFilmed = 240; // the frame rate its maker states on Wikimedia Commons
  const gymCal = gym.measured.calibration as { px?: number; sigmaPx?: number };
  const gymLen = gym.observation.reference.real_length_m;
  const NASA = { who: "NASA, Apollo 16, 1972", licence: "Public domain", href: moon.source.page ?? "" };
  const FIZ = { who: "Zátonyi Sándor (ifj.), FizFilm", licence: "CC BY 4.0", href: fou.source.page ?? "" };
  const GYM_PAGE = "https://commons.wikimedia.org/wiki/File:Flummiversuch_(Gymnastikball-R%C3%BCcksteigh%C3%B6he).webm";
  const src = (e: Experiment) => ({ credit: e.source.credit ?? "", licence: e.source.license ?? "", href: e.source.page ?? "" });

  // mixed, so the two copies of one film are never side by side
  const clips: CytClip[] = [
    {
      id: "foucault-pendulum-5x",
      src: "/cyt/foucault-pendulum-5x.mp4",
      poster: "/cyt/foucault-pendulum-5x.webp",
      credit: FIZ,
      title: fou5.title,
      source: { ...src(fou5), cut: "6 s from 4 s into the run’s clip, cropped square around the bob", record: "data/showcase/foucault-pendulum-5x.json" },
      spark: sparkOf(fou5),
      ansatz: ansatzOf(fou5),
      truth: { verdict: verdictOf(1 / (fou5S?.truth ?? 5)), factor: `${fou5S?.truth ?? 5}× faster`, source: "The filmmaker sped this stretch up and labelled it on screen. We cropped the label out before the run." },
    },
    {
      id: "moon-jump",
      src: "/cyt/moon-jump.mp4",
      poster: "/cyt/moon-jump.webp",
      credit: NASA,
      title: "Apollo 16, as broadcast",
      source: { ...src(moon), cut: "5.2 s from 1.2 s into the broadcast, cropped square around John Young", record: "data/showcase/moon-jump.json (extras.speedTest.repeats, clip A)" },
      spark: sparkOf(moon, "A"),
      ansatz: ansatzOf(moon),
      truth: { verdict: "real time", factor: "Real time", source: "The 1972 television broadcast, as digitised for the Apollo Lunar Surface Journal." },
    },
    {
      id: "aachen-pendulum-50cm",
      src: "/cyt/aachen-pendulum-50cm.mp4",
      poster: "/cyt/aachen-pendulum-50cm.webp",
      credit: { who: "Rhetos, Mathe-AC Lernwerkstatt Aachen", licence: "CC BY-SA 4.0", href: aachen.source.page ?? "" },
      title: aachen.title,
      source: { ...src(aachen), cut: "5 s from 2 s into the run’s clip, cropped square", record: "data/showcase/aachen-pendulum-50cm.json" },
      spark: sparkOf(aachen),
      ansatz: ansatzOf(aachen),
      truth: { verdict: "real time", factor: "Real time", source: "The film’s own stopwatch, cropped out before the run, times a swing at about 1.42 s; a 0.5 m pendulum on Earth swings in 1.418 s." },
    },
    {
      id: "gym-ball-bounce",
      src: "/cyt/gym-ball-bounce.mp4",
      poster: "/cyt/gym-ball-bounce.webp",
      credit: { who: "Rhetos", licence: "CC BY-SA 4.0", href: GYM_PAGE },
      title: "Gym ball bouncing (not published: a miss)",
      source: { credit: "Rhetos, Flummiversuch (Gymnastikball-Rücksteighöhe)", licence: "CC BY-SA 4.0", href: GYM_PAGE, cut: "the run’s whole 2.5 s clip (3.0 to 5.5 s of the original), cropped square around the ball", record: "data/strangers/gym-ball-bounce-240fps-b.json (the second of two runs; the first, on 1.5 to 5.5 s, also said real time)" },
      spark: sparkOf(gym),
      ansatz: ansatzOf(
        gym,
        gymCal.px !== undefined && gymCal.sigmaPx !== undefined
          ? `SAM 3.1 held only part of the green ball in a green-lit corridor: ${Math.round(gymCal.px)} ± ${Math.round(gymCal.sigmaPx)} px across for a ball said to be ${Math.round(gymLen * 100)} cm. No law came out with a gravity, so there was nothing to check the clock against.`
          : undefined,
      ),
      truth: { verdict: verdictOf(gymFilmed / gymFps), factor: `${fmt(gymFilmed / gymFps, 1)}× slower`, source: `Filmed at ${gymFilmed} frames a second and stored at ${gymFps}, as its Wikimedia Commons page says.` },
    },
    {
      id: "moon-jump-slowed",
      src: "/cyt/moon-jump-slowed.mp4",
      poster: "/cyt/moon-jump-slowed.webp",
      credit: NASA,
      title: "Apollo 16, slowed in secret",
      source: { ...src(slowed), cut: "5.2 s from 1.8 s into the slowed copy, cropped square around John Young", record: "data/showcase/moon-jump-slowed.json; Muse Spark’s answers in data/showcase/moon-jump.json (extras.speedTest.repeats, clip B)" },
      spark: sparkOf(moon, "B"),
      ansatz: ansatzOf(slowed, sj ? `From its gravity alone, against the Moon’s. Jump for jump against the broadcast: ${fmt(sj.ratio, 3)} ± ${fmt(sj.sigma, 3)}×.` : undefined),
      truth: { verdict: verdictOf(st?.truth ?? 1.5), factor: `${st?.truth ?? 1.5}× slower`, source: "We slowed the broadcast ourselves, with motion-interpolated frames at an ordinary 29.97 fps, and told no one." },
    },
    {
      id: "foucault-pendulum",
      src: "/cyt/foucault-pendulum.mp4",
      poster: "/cyt/foucault-pendulum.webp",
      credit: FIZ,
      title: fou.title,
      source: { ...src(fou), cut: "6 s from 12 s into the run’s clip, cropped square around the bob", record: "data/showcase/foucault-pendulum.json" },
      spark: sparkOf(fou),
      ansatz: ansatzOf(fou),
      truth: { verdict: "real time", factor: "Real time", source: `The filmmaker published the pendulum’s length and its ${fouT?.truth ?? 6} s swing with the film.` },
    },
  ];
  return {
    clips,
    spark: clips.filter((c) => c.spark.verdict === c.truth.verdict).length,
    ansatz: clips.filter((c) => c.ansatz.verdict === c.truth.verdict).length,
  };
}
