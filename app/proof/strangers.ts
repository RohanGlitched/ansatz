// Clips strangers filmed and published under free licences, run on 2 November in three sets with only what their makers
// stated. Figures are from those runs (.probe/real-2026-11-02/*.json, NOTES.md, NOTES-2.md and NOTES-3.md; the third
// set's credits in ../media/real/new3/CREDITS.json); the promoted ones are also experiments.
// Proof's Table 1a prints them in full, and the experiments index lists them until visitors' runs exist.
const COMMONS = "https://commons.wikimedia.org/wiki/File:";

export type Stranger = {
  clip: string;
  href?: string;
  who: string;
  whoHref: string;
  licence: string;
  told: string;
  measured: string;
  truth: string;
  /** a row with a run page (href) follows that page's rule: a winning law that misses its unseen frames by more than
   * ROUGH_Z times the noise gets no error bar, so it is never "measured" (test/strangers-verdicts.test.ts checks it) */
  verdict: "measured" | "about right, no error bar" | "number right, law wrong" | "miss" | "nothing to check";
  note: string;
  /** where the truth is stated, linked beside it */
  sources?: { label: string; href: string }[];
  /** a miss that came from the tracking (SAM 3.1 held the wrong thing, or the track broke), not from the law */
  tracking?: boolean;
  /** which set of runs: 1 (the first five clips), 2 (six more, the same night) or 3 (five YouTube CC BY pendulums) */
  set: 1 | 2 | 3;
  /** the run's record in .probe/real-2026-11-02 (kept with the review notes): a figure follows the run page's rule, no ±
   * when the winning law misses its unseen frames by more than five times the noise (the test reads it where present) */
  record?: string;
};

/** The first set's six ledgers (two tries on the gym ball), summed: $1.996; the Aachen page's translations add $0.51.
 * The second set's seven ledgers (two tries on the board fall): $2.540; the 60 cm page's translations add $0.027.
 * The third set's five ledgers: $1.843; the ThinkTac and Rosolowsky pages' translations add about $0.054 (estimated at
 * round 2's $0.027 a page, NOTES-3.md). */
export const STRANGERS_SETS = [
  { runs: 6, usd: 2.0, withTranslations: 2.51 },
  { runs: 7, usd: 2.54, withTranslations: 2.567 },
  { runs: 5, usd: 1.843, withTranslations: 1.897 },
];
export const STRANGERS_RUNS_USD = STRANGERS_SETS.reduce((t, s) => t + s.usd, 0);
export const STRANGERS_WITH_TRANSLATIONS_USD = STRANGERS_SETS.reduce((t, s) => t + s.withTranslations, 0);
export const STRANGERS_RUNS = STRANGERS_SETS.reduce((t, s) => t + s.runs, 0);

export const STRANGERS: Stranger[] = [
  {
    clip: "Pendulum, 50 cm: a grey bob on black",
    href: "/x/aachen-pendulum-50cm",
    who: "Rhetos, Mathe-AC Lernwerkstatt Aachen",
    whoHref: `${COMMONS}Schwingung_(Definition).webm`,
    licence: "CC BY-SA 4.0",
    told: "“The string is about fifty centimetres long.” The film’s own description says a pendulum half a metre long.",
    measured: "g = 9.82 ± 0.10 m/s². Clock check: real time.",
    truth: "9.807 m/s² (about 9.81). The film’s own result card, cropped out before the run, gives one swing as about 1.42 s (theory 1.418 s).",
    verdict: "measured",
    note: "0.16% off, 0.2σ. The ± assumes the stated length is good to 1%; the fit alone gives ± 0.005. Had the 50 cm been the string alone, without the bob, g would read about 10.0. Published as an experiment.",
    sources: [{ label: "the Commons file and its description", href: `${COMMONS}Schwingung_(Definition).webm` }],
    set: 1,
    record: "pendulum-50cm-aachen",
  },
  {
    clip: "Pendulum, 25 cm, in a test rig",
    who: "NS (Nikos.kse)",
    whoHref: `${COMMONS}Pendulum_in_controlled_gravity.ogv`,
    licence: "CC BY-SA 4.0",
    told: "“The pendulum is twenty-five centimetres long.”",
    measured: "g about 9.84 m/s², no error bar: the winning law misses the unseen frames by 102× the noise. Clock check: real time.",
    truth: "9.81 m/s². The file’s description on Wikimedia Commons gives a period of 1 s for a 25 cm pendulum in normal gravity (theory 1.003 s).",
    verdict: "number right, law wrong",
    note: "0.3% off. But the simple-harmonic law misses the unseen swing by 15% of the motion, so the publish gate refused it. The number landed; the law did not earn it.",
    sources: [{ label: "the Commons file description", href: `${COMMONS}Pendulum_in_controlled_gravity.ogv` }],
    set: 1,
    record: "pendulum-25cm-normal-gravity",
  },
  {
    clip: "Metronome at 96 beats a minute",
    who: "Daniel Eriksson (Belteshassar)",
    whoHref: `${COMMONS}Metronome.webm`,
    licence: "CC BY 4.0",
    told: "No length, and no scale in view.",
    measured: "No law fitted. The large-angle pendulum misses by 25× the noise; with no scale there is no clock check.",
    truth: "The dial: 96 beats a minute, 1.25 s a full cycle.",
    verdict: "miss",
    note: "No law in the library is a metronome. Offline, timed to a fraction of a frame, the tracked arm repeats about every 1.24 s, against the dial’s 1.25 s (a dial good to a percent or two).",
    sources: [{ label: "the Commons file", href: `${COMMONS}Metronome.webm` }],
    set: 1,
    record: "metronome-96bpm",
  },
  {
    clip: "Brass bob in front of a metre rule",
    who: "Lim Jit Ning, shared by Loo Kang Wee",
    whoHref: "https://www.youtube.com/watch?v=ZZBGxkgtXN8",
    licence: "YouTube CC BY",
    told: "Nothing. Muse Spark picked a metre rule behind the bob, read as 1 m from its markings, running off the frame; SAM 3.1 read it as 1281 ± 1 px.",
    measured: "A pendulum with viscous drag fits within the noise: L = 0.716 ± 0.002 m, from the period with g held at Earth’s: the ± is Earth’s g, assumed to ±0.26%; the rule’s scale does not enter it.",
    truth: "Not published: no length, no period.",
    verdict: "nothing to check",
    note: "Nothing to compare with, so it is not counted as a result.",
    sources: [{ label: "the video", href: "https://www.youtube.com/watch?v=ZZBGxkgtXN8" }],
    set: 1,
    record: "pendulum-ruler-limjitning",
  },
  {
    clip: "Gym ball bouncing, filmed at 240 fps, stored at 50",
    who: "Rhetos",
    whoHref: `${COMMONS}Flummiversuch_(Gymnastikball-R%C3%BCcksteigh%C3%B6he).webm`,
    licence: "CC BY-SA 4.0",
    told: "The ball is about 75 cm across. The second try added that it bounces on the floor.",
    measured: "Try 1: four bounce laws (three from Muse Spark, one from Muse Wonder) each missed the unseen frames by about 250× the noise, and a control with no floor ranked first. Try 2: bounce laws again, missing by 490× the noise or more. In both runs Muse Spark, describing the clip to say what to track, took it as real time (the home page’s blind test, which asks the speed question itself, has its answers to that); Ansatz measured no gravity, so it could not check the clock.",
    truth: "It plays 4.8× slower than life: its maker’s own page, which the Commons file names as its source, says it was filmed at 240 frames a second, and the file plays at 50. The same page says the ball rebounds to about 70% of its drop height.",
    verdict: "miss",
    note: "A green ball in a green-lit corridor: SAM 3.1 held only part of it (89 px across for 75 cm), so every scale was wrong and the slowdown could not be checked.",
    sources: [
      { label: "the Commons file", href: `${COMMONS}Flummiversuch_(Gymnastikball-R%C3%BCcksteigh%C3%B6he).webm` },
      { label: "its maker’s page (rhetos.de)", href: "https://www.rhetos.de/html/lex/flummiversuche.htm" },
    ],
    tracking: true,
    set: 1,
    record: "gym-ball-bounce-240fps-b",
  },
  {
    clip: "Pendulum, 60 cm, before a ruler",
    href: "/x/aachen-pendulum-60cm",
    who: "Rhetos, Mathe-AC Lernwerkstatt Aachen",
    whoHref: `${COMMONS}Fadenpendelgeschwindigkeit_(2_grad).webm`,
    licence: "CC BY-SA 4.0",
    told: "“The string is about sixty centimetres long.”",
    measured: "g about 10 m/s², no error bar: the law misses the unseen frames by 21× the noise. Earth’s is 9.807. Clock check: real time, roughly, which is right (filmed at 24 fps and stored at 25, with one frame repeated each second).",
    truth: "0.6 m, said on screen; one swing counted on screen as 37 frames of 1/24 s, about 1.54 s (theory 1.554 s).",
    verdict: "about right, no error bar",
    note: "No error bar: the law misses the unseen frames by 21× the noise. Had it fitted, the bar would be ± 0.12 m/s² (± 0.07 from the fit, ± 0.10 from the stated 60 cm if it is good to 1%). The ruler in view does not enter g: with the length held at 60 cm, the swing gives g/L, which does not depend on the scale. Dropping the repeated frame and retiming to 24 fps cuts the miss on the unseen frames from 3.8 to 2.8 mm (21× to 17× the noise), still a rough fit. Published as an experiment.",
    sources: [{ label: "the Commons file", href: `${COMMONS}Fadenpendelgeschwindigkeit_(2_grad).webm` }],
    set: 2,
    record: "pendulum-60cm-24fps",
  },
  {
    clip: "Pendulum, 5 m, let down a promenade wall",
    who: "Rhetos, Mathe-AC Lernwerkstatt Aachen",
    whoHref: `${COMMONS}Hoehenmessung_(Strandpromenade_Wangerooge).webm`,
    licence: "CC BY-SA 4.0",
    told: "“The pendulum string is about five metres long.”",
    measured: "No pendulum law won. Three laws holding the stated 5 m gave g about 9.7 m/s², with no error bar: they missed the unseen frames by 17 px, 13× the noise; a control with no force missed by 10.5 px and ranked first.",
    truth: "Ten swings in 44.64 s, so 4.464 s a swing; its maker works the length back to 4.96 m.",
    verdict: "miss",
    note: "A tracking failure: filmed looking down the string at an apple about 15 px across, with the camera drifting, the tracked swing repeats every 3.04 s, not 4.46 s.",
    sources: [
      { label: "the Commons file", href: `${COMMONS}Hoehenmessung_(Strandpromenade_Wangerooge).webm` },
      { label: "its maker’s page (rhetos.de)", href: "https://www.rhetos.de/html/lex/hoehenmessung_(pendelmethode).htm" },
    ],
    tracking: true,
    set: 2,
    record: "pendulum-5m-wangerooge",
  },
  {
    clip: "Pendulum, 25 cm, at 0.4 g, in a test rig",
    who: "NS (Nikos.kse)",
    whoHref: `${COMMONS}Pendulum_in_controlled_gravity.ogv`,
    licence: "CC BY-SA 4.0",
    told: "“The pendulum is twenty-five centimetres long.”",
    measured: "Laws holding the stated 25 cm give g about 4.6 m/s², but they lost. The winner, Muse Wonder’s, keeps Earth’s g and stretches the length to about 0.54 m; every law misses the unseen frames by 7× the noise or more, so none carries an error bar.",
    truth: "The caption: 25 cm, 0.4 g, a 1.5 s period (0.4 g is 3.92 m/s²; a 1.5 s period on 25 cm means 4.39, so the caption’s two figures disagree a little).",
    verdict: "miss",
    note: "The figure near the caption (about 4% above the period’s 4.39, 17% above 0.4 g) came from laws that lost, and the winning law ignores the stated length, so it compares nothing: a miss, not published.",
    sources: [{ label: "the Commons file", href: `${COMMONS}Pendulum_in_controlled_gravity.ogv` }],
    set: 2,
    record: "pendulum-25cm-04g",
  },
  {
    clip: "Ball tossed up, in 10× slow motion",
    who: "Rhetos, Mathe-AC Lernwerkstatt Aachen",
    whoHref: `${COMMONS}Senkrechter_Wurf_nach_oben_(Steigzeit).webm`,
    licence: "CC BY-SA 4.0",
    told: "“The juggling ball rises about sixty centimetres.”",
    measured: "Nothing usable: the slow motion repeats each frame about ten times, which broke the track (20 points over 0.08 s). Muse Spark did read the slow motion as 10× by eye.",
    truth: "On screen: 10× slow motion; the ball rises 0.6 m in 0.32 s.",
    verdict: "miss",
    note: "A tracking failure on slow motion made by repeating frames.",
    sources: [{ label: "the Commons file", href: `${COMMONS}Senkrechter_Wurf_nach_oben_(Steigzeit).webm` }],
    tracking: true,
    set: 2,
    record: "toss-60cm-10x",
  },
  {
    clip: "Ball dropped before a numbered board, in 5× slow motion",
    who: "Rhetos, Mathe-AC Lernwerkstatt Aachen",
    whoHref: `${COMMONS}Zeitsymmetrie_(freier_Fall).webm`,
    licence: "CC BY-SA 4.0",
    told: "“The lines on the board are numbered in centimetres, from 0 to 75.”",
    measured: "Two tries. The first lost the ball at the release. The second, cut after the release: g about 0.38 m/s² in clip time, from a law that lost to a control with no force (the winner misses the unseen frames by 177× the noise), so no error bar and no clock check.",
    truth: "On screen: it plays at 0.2× speed (5× slow motion), and it is a free fall on Earth.",
    verdict: "miss",
    note: "Offline arithmetic only, not Ansatz’s claim: 0.375 × 5² = 9.4 m/s². Too rough to count.",
    sources: [{ label: "the Commons file", href: `${COMMONS}Zeitsymmetrie_(freier_Fall).webm` }],
    set: 2,
    record: "fall-board-5x-b",
  },
  {
    clip: "Pendulum, 50 cm, before a chalkboard (run again)",
    who: "Rhetos, Mathe-AC Lernwerkstatt Aachen",
    whoHref: `${COMMONS}Pendelgesetz_(mit_Rechnung).webm`,
    licence: "CC BY-SA 4.0",
    told: "“The pendulum is half a metre long.”",
    measured: "g about 6.81 m/s², 30.6% low, no error bar (the law misses the unseen frames by 17× the noise); the clock check said the clock or the length was in doubt (both were fine).",
    truth: "0.5 m on the board; the film’s stopwatch times ten swings at 14.20 s, 1.42 s each.",
    verdict: "miss",
    note: "A tracking failure: a dark weight on a dark board, and the tracked swing repeats every 1.72 s, not 1.42 s. The same film failed on 29 October, when SAM 3.1 could not hold the weight at all.",
    sources: [{ label: "the Commons file", href: `${COMMONS}Pendelgesetz_(mit_Rechnung).webm` }],
    tracking: true,
    set: 2,
    record: "pendulum-50cm-chalkboard",
  },
  {
    clip: "Pendulum, 60 cm: a ring magnet on a thread",
    href: "/x/thinktac-pendulum-60cm",
    who: "ThinkTac (Gopinath Thiru)",
    whoHref: "https://www.youtube.com/watch?v=iCH2-nhq6bs",
    licence: "YouTube CC BY",
    told: "“Using a ruler, measure 60 cm starting from the knot on the ring magnet.” (the maker’s on-screen line)",
    measured: "g = 9.826 ± 0.099 m/s². Clock check: real time.",
    truth: "9.807 m/s². A 0.60 m pendulum swings in 1.554 s; the tracked swing, timed offline, repeats every 1.550 s.",
    verdict: "measured",
    note: "0.20% off, 0.2σ. The ± is almost all the 1% given to a stated length; the fit alone gives ± 0.015. A caveat: the 60 cm runs to the knot, and the magnet’s centre hangs a few millimetres lower; 7 mm lower would make the same swing give g about 9.95 (+1.4%), and the magnet’s size is not stated. The stopwatch overlay was cropped out first. Published as an experiment.",
    sources: [{ label: "the video (“Motion - Periodic”)", href: "https://www.youtube.com/watch?v=iCH2-nhq6bs" }],
    set: 3,
    record: "pendulum-60cm-thinktac",
  },
  {
    clip: "Pendulum, 27 inches, hung from a book",
    href: "/x/rosolowsky-pendulum-27in",
    who: "Erik Rosolowsky (PHYS124)",
    whoHref: "https://www.youtube.com/watch?v=3_YK_hRzyTM",
    licence: "YouTube CC BY",
    told: "“I’ll just measure from the pivot point down there and it looks like it’s about 27 inches.” (spoken)",
    measured: "g about 9.7 m/s², no error bar: the law misses the unseen frames by 5.18× the noise, just over the run page’s 5× line. Clock check: real time.",
    truth: "9.807 m/s²; a 0.686 m pendulum swings in 1.661 s. The maker times ten swings at 16.4 s, 1.64 s each, 1.7% short of theory and of the tracked 1.667 s, as hand timing of ten swings tends to be.",
    verdict: "number right, law wrong",
    note: "0.8% off, but under the site’s rule a law that misses the unseen frames by more than 5× the noise earns no error bar, so the number landed and the law did not. Two drag laws tie it on the unseen frames (g 9.78) and lose on simplicity. Published as an experiment.",
    sources: [{ label: "the video (“PHYS124 - The Pendulum”)", href: "https://www.youtube.com/watch?v=3_YK_hRzyTM" }],
    set: 3,
    record: "pendulum-27in-rosolowsky",
  },
  {
    clip: "Pendulum, 40 cm, a 200 g hanger",
    who: "Physagreg (physagreg.fr)",
    whoHref: "https://www.youtube.com/watch?v=T3A3C4X44RI",
    licence: "YouTube CC BY",
    told: "“Simple pendulum, 40 cm, m + 200.” (the title)",
    measured: "g about 10.0 m/s², no error bar: the law misses the unseen frames by 9.7× the noise. Clock check: real time.",
    truth: "9.807 m/s²; a 0.40 m pendulum swings in 1.269 s, and the tracked swing, timed offline, repeats every 1.267 s.",
    verdict: "number right, law wrong",
    note: "2.1% off, but the law misses the unseen swing by 12% of the motion, so the publish gate refused it. A slotted-mass hanger swinging wide, filmed for students’ video analysis.",
    sources: [{ label: "the video (“pendule simple 40cm m+200”)", href: "https://www.youtube.com/watch?v=T3A3C4X44RI" }],
    set: 3,
    record: "pendulum-40cm-physagreg-200g",
  },
  {
    clip: "Pendulum, 40 cm, a 100 g hanger",
    who: "Physagreg (physagreg.fr)",
    whoHref: "https://www.youtube.com/watch?v=ol-WCab0ISI",
    licence: "YouTube CC BY",
    told: "“Simple pendulum, 40 cm, m + 100.” (the title)",
    measured: "g about 11.92 m/s², 21.6% high, no error bar (the law misses the unseen frames by 10× the noise). The clock check said the clip plays about 1.1× faster than life, which is wrong.",
    truth: "9.807 m/s²; the tracked swing repeats every 1.315 s, longer than a 0.40 m pendulum’s 1.269 s, so the clip is not sped up.",
    verdict: "miss",
    note: "SAM 3.1 held the bob in 138 of 150 frames, but the tracked height jumps by about 200 px: the mask slipped. The gate refused it.",
    sources: [{ label: "the video (“pendule simple 40cm m+100”)", href: "https://www.youtube.com/watch?v=ol-WCab0ISI" }],
    tracking: true,
    set: 3,
    record: "pendulum-40cm-physagreg-100g",
  },
  {
    clip: "Pendulum, 35 cm: a washer filmed from above",
    who: "Shannan Muskopf",
    whoHref: "https://www.youtube.com/watch?v=JQbHsR0PkUc",
    licence: "YouTube CC BY",
    told: "“Length of string = 35 cm.” (the on-screen caption)",
    measured: "g about 8.684 m/s², 11.4% low, no error bar (the law misses the unseen frames by 9.7× the noise). The clock check called it real time, though 11% off is a miss, not a pass.",
    truth: "9.807 m/s²; a 0.35 m pendulum swings in 1.187 s, and the student’s spoken count runs at about 1.2 s a swing.",
    verdict: "miss",
    note: "Filmed from above at a steep angle, so the swing is foreshortened, and the small washer blurs mid-swing: SAM 3.1 masked it in 162 of 300 frames. The caption and the digital timer were cropped out first.",
    sources: [{ label: "the video (“Pendulum and Length”)", href: "https://www.youtube.com/watch?v=JQbHsR0PkUc" }],
    set: 3,
    record: "pendulum-35cm-muskopf",
  },
];

const W = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "twenty-one", "twenty-two", "twenty-three"];
const word = (k: number) => W[k] ?? String(k);
const count = (...vs: Stranger["verdict"][]) => STRANGERS.filter((r) => vs.includes(r.verdict)).length;
/** "sixteen clips strangers filmed: two measured, four where the number landed but the law did not, one with no published
 * answer and nine misses (five of them tracking failures)", counted from the table */
export const strangersTally = () => {
  const miss = count("miss"), tr = STRANGERS.filter((r) => r.verdict === "miss" && r.tracking).length;
  return {
    n: STRANGERS.length,
    measured: count("measured"),
    lawWrong: count("number right, law wrong", "about right, no error bar"),
    nothing: count("nothing to check"),
    miss,
    tracking: tr,
    text: `${word(STRANGERS.length)} clips strangers filmed: ${word(count("measured"))} measured, ${word(count("number right, law wrong", "about right, no error bar"))} where the number landed but the law did not, ${word(count("nothing to check"))} with no published answer and ${word(miss)} misses${tr ? ` (${word(tr)} of them tracking failures)` : ""}`,
  };
};
export const strangersWord = word;
