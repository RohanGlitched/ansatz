/**
 * The Class XI practicals about motion and force, as the two documents a CBSE physics teacher works from list them,
 * and what Ansatz does for each today. Titles are paraphrased; the numbers are the documents' own. Checked against:
 *  - CBSE, Physics (Subject Code 042), Classes XI–XII, curriculum 2026-27, Class XI practicals, PDF pp. 7–9
 *    (the Class XI list is word for word the same in the 2025-26 curriculum)
 *  - NCERT, Laboratory Manual: Physics, Class XI, contents (kelm101.pdf) and the chapters linked per row
 * Nothing here is a measurement: the accuracy shown beside each covered row is read from the stored runs on the page.
 */

export const CBSE_URL = "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf";
export const CBSE_2526_URL = "https://cbseacademic.nic.in/web_material/CurriculumMain26/SrSec/Physics_SrSec_2025-26.pdf";
export const NCERT_BASE = "https://ncert.nic.in/pdf/publication/sciencelaboratorymanuals/classXI/physics/";
export const NCERT_CONTENTS = `${NCERT_BASE}kelm101.pdf`;

export type Status = "covered" | "part" | "not";

export type Practical = {
  /** where it sits in the CBSE list: section, experiment or activity, number */
  cbse: { section: "A" | "B"; kind: "Experiment" | "Activity"; n: number; page: number };
  /** what it asks for, paraphrased */
  title: string;
  /** the NCERT lab manual's own entry for it (E = experiment, A = activity, P = project), with its printed page */
  ncert: { ref: string; page: number; file: string; note?: string }[];
  status: Status;
  /** what Ansatz does for it today, in one or two sentences */
  today: string;
  runs: { label: string; href: string }[];
};

export const PRACTICALS: Practical[] = [
  {
    cbse: { section: "A", kind: "Experiment", n: 7, page: 8 },
    title: "Simple pendulum: plot its graph and find the effective length of the seconds pendulum",
    ncert: [{ ref: "E6", page: 60, file: "kelm103.pdf", note: "L–T and L–T² graphs" }],
    status: "covered",
    today: "Each clip gives the period to a few hundredths of a percent; four lengths give g from the slope of L against T², and the seconds pendulum’s length from g.",
    runs: [
      { label: "One pendulum, four lengths", href: "/series/pendulum-lengths" },
      { label: "Narrated in Hindi", href: "/x/hindi-pendulum" },
      { label: "A stranger’s pendulum, Aachen", href: "/x/aachen-pendulum-50cm" },
    ],
  },
  {
    cbse: { section: "A", kind: "Experiment", n: 8, page: 8 },
    title: "Period of a pendulum of fixed length with bobs of the same size and different masses",
    ncert: [],
    status: "not",
    today: "The filming is the same as the row above, one clip per bob, but no such set has been run, so there is no accuracy to quote.",
    runs: [],
  },
  {
    cbse: { section: "A", kind: "Experiment", n: 9, page: 8 },
    title: "Limiting friction against normal reaction; coefficient of friction of a block on a horizontal surface",
    ncert: [{ ref: "E7", page: 68, file: "kelm103.pdf" }],
    status: "not",
    today: "A force read on a spring balance at the moment the block slips. Nothing moves long enough to film, so Ansatz has nothing to measure.",
    runs: [],
  },
  {
    cbse: { section: "A", kind: "Experiment", n: 10, page: 8 },
    title: "Downward force on a roller along an inclined plane, against sin θ",
    ncert: [{ ref: "E8", page: 74, file: "kelm104.pdf" }],
    status: "not",
    today: "A static balance of forces. Two rendered balls rolling down an incline are in the benchmark, with their law only and no constant checked; that is not this practical.",
    runs: [],
  },
  {
    cbse: { section: "A", kind: "Activity", n: 5, page: 8 },
    title: "Range of a projectile against the angle of projection",
    ncert: [{ ref: "A5", page: 140, file: "kelm108.pdf", note: "done with a jet of water" }],
    status: "part",
    today: "One throw at a time: the path, its law and its drag. Range against angle needs one clip per angle, which has not been run; a jet of water is not one object, so SAM 3.1 cannot follow it.",
    runs: [{ label: "A throw with air drag", href: "/x/beach-ball-drag" }],
  },
  {
    cbse: { section: "A", kind: "Activity", n: 6, page: 8 },
    title: "Conservation of energy of a ball rolling down a double inclined plane",
    ncert: [{ ref: "A6", page: 144, file: "kelm109.pdf" }],
    status: "not",
    today: "Not run. The ball is one object crossing the frame, so it could be filmed, but no energy check has been built or tested.",
    runs: [],
  },
  {
    cbse: { section: "A", kind: "Activity", n: 7, page: 8 },
    title: "Dissipation of energy of a simple pendulum: square of the amplitude against time",
    ncert: [{ ref: "A7", page: 148, file: "kelm109.pdf" }],
    status: "covered",
    today: "Every pendulum run fits a damping rate γ with its error bar. The energy, which goes as the amplitude squared, falls as exp(−γt): the curve this activity plots.",
    runs: [
      { label: "A 70° swing, damping known", href: "/x/big-swing" },
      { label: "Pendulum, 80 cm", href: "/x/pendulum-80cm" },
    ],
  },
  {
    cbse: { section: "B", kind: "Experiment", n: 2, page: 9 },
    title: "Force constant of a helical spring from a graph of load against extension",
    ncert: [
      { ref: "E10", page: 83, file: "kelm105.pdf", note: "by oscillation: T² against m" },
      { ref: "P9", page: 208, file: "kelm111.pdf", note: "project: load against extension" },
    ],
    status: "part",
    today: "The NCERT manual’s oscillation method, one mass per clip: ω₀ = √(k/m) needs no ruler, and k = mω₀² with the mass weighed. The CBSE load–extension method is static. T² against m needs several clips, not run yet.",
    runs: [{ label: "A damped spring", href: "/x/spring" }],
  },
  {
    cbse: { section: "B", kind: "Experiment", n: 5, page: 9 },
    title: "Coefficient of viscosity of a liquid from the terminal velocity of a sphere",
    ncert: [{ ref: "E13", page: 99, file: "kelm106.pdf" }],
    status: "not",
    today: "Not run. A ball sinking in a liquid behind glass is one object crossing the frame, but refraction through the jar and the fit have not been tested.",
    runs: [],
  },
];

export const statusWord: Record<Status, string> = { covered: "Covered today", part: "In part", not: "Not yet" };

export const cbseLabel = (p: Practical) => `${p.cbse.section} · ${p.cbse.kind} ${p.cbse.n}`;
