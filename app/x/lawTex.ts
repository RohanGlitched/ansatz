import { lawLatex } from "@/lib/latex";
import type { Law } from "@/lib/physics/law";

/**
 * A law's equations as the pages print them. lib/latex sets a state named w as ω; where w is a distance (the Foucault
 * bob's swing in metres) and no parameter is an angular frequency, that ω reads as one, so it is printed as w.
 */
export function lawTex(law: Law): string[] {
  const lines = lawLatex(law);
  const wIsState = (law as Law & { state?: string[] }).state?.includes("w");
  const hasOmega = law.params.some((p) => /^(omega|w)/i.test(p.name));
  return wIsState && !hasOmega ? lines.map((l) => l.replace(/\\omega(?![a-zA-Z])/g, "w")) : lines;
}

/** The same fix for a law already set as KaTeX HTML (the Falsification Plate's ledger, from lib/plateLaws). */
export function lawHtml(law: Law, html: string): string {
  const wIsState = (law as Law & { state?: string[] }).state?.includes("w");
  const hasOmega = law.params.some((p) => /^(omega|w)/i.test(p.name));
  return wIsState && !hasOmega ? html.replace(/ω/g, "w").replace(/\\omega(?![a-zA-Z])/g, "w") : html;
}
