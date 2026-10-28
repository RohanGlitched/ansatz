import katex from "katex";
import { lawLatex } from "./latex";
import type { Experiment } from "./experiment";

/** The laws of one run as the Falsification Plate needs them: who proposed each, and its equation as KaTeX HTML. */
export function plateLaws(e: Experiment) {
  return e.candidates.map((c) => ({
    id: c.law.id,
    who: c.origin === "muse" ? "Muse Spark proposed" : c.origin === "revision" ? "Muse Wonder proposed" : c.origin === "control" ? "textbook control" : c.origin,
    html: katex.renderToString(lawLatex(c.fitted ?? c.law).at(-1) ?? c.law.title, { throwOnError: false, strict: "ignore", output: "html" }),
  }));
}
