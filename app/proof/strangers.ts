// Five clips strangers filmed and published under free licences, run on 2 November with only what their makers stated.
// Figures are from that night's runs (.probe/real-2026-11-02/*.json and NOTES.md); the promoted one is also an experiment.
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
  verdict: "measured" | "number right, law wrong" | "miss" | "nothing to check";
  note: string;
};

/** The six ledgers of that night (two tries on the gym ball), summed: $1.996; the Aachen page's translations add $0.51. */
export const STRANGERS_RUNS_USD = 2.0;
export const STRANGERS_WITH_TRANSLATIONS_USD = 2.51;

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
  },
  {
    clip: "Pendulum, 25 cm, in a test rig",
    who: "NS (Nikos.kse)",
    whoHref: `${COMMONS}Pendulum_in_controlled_gravity.ogv`,
    licence: "CC BY-SA 4.0",
    told: "“The pendulum is twenty-five centimetres long.”",
    measured: "g = 9.84 ± 0.17 m/s². Clock check: real time.",
    truth: "9.81 m/s². The film’s caption gives a period of 1 s (theory 1.003 s).",
    verdict: "number right, law wrong",
    note: "0.3% off. But the simple-harmonic law misses the unseen swing by 15% of the motion, so the publish gate refused it. The number landed; the law did not earn it.",
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
  },
  {
    clip: "Brass bob in front of a metre rule",
    who: "Lim Jit Ning, shared by Loo Kang Wee",
    whoHref: "https://www.youtube.com/watch?v=ZZBGxkgtXN8",
    licence: "YouTube CC BY",
    told: "Nothing. Muse Spark picked a metre rule behind the bob, read as 1 m from its markings, running off the frame; SAM 3.1 read it as 1281 ± 1 px.",
    measured: "A pendulum with viscous drag fits within the noise: L = 0.716 ± 0.072 m, from the period with g held at Earth’s, so the rule’s scale does not enter it.",
    truth: "Not published: no length, no period.",
    verdict: "nothing to check",
    note: "Nothing to compare with, so it is not counted as a result.",
  },
  {
    clip: "Gym ball bouncing, filmed at 240 fps, stored at 50",
    who: "Rhetos",
    whoHref: `${COMMONS}Flummiversuch_(Gymnastikball-R%C3%BCcksteigh%C3%B6he).webm`,
    licence: "CC BY-SA 4.0",
    told: "The ball is about 75 cm across. The second try added that it bounces on the floor.",
    measured: "Try 1: four bounce laws (three from Muse Spark, one from Muse Wonder) each missed the unseen frames by about 250× the noise, and a control with no floor ranked first. Try 2: bounce laws again, missing by 490× the noise or more. Muse Spark called the clip real time both times; Ansatz measured no gravity, so it could not check the clock.",
    truth: "It plays 4.8× slower than life. The source page says the ball rebounds to about 70% of its drop height.",
    verdict: "miss",
    note: "A green ball in a green-lit corridor: SAM 3.1 held only part of it (89 px across for 75 cm), so every scale was wrong and the slowdown could not be checked.",
  },
];
