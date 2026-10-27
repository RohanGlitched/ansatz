import Link from "next/link";
import { getExperiment } from "@/lib/experiments";
import size from "./hero-final.json";
import styles from "./HeroStill.module.css";

/**
 * The home page's A/B Moon print as one still (public/hero-final.webp, made by scripts/stills.mjs from the finished,
 * reduced-motion hero), linked to the home page where it plays. The alt text and caption carry the measured numbers,
 * read from the stored run.
 */
export default async function HeroStill() {
  const e = await getExperiment("moon-jump").catch(() => null);
  const sj = e?.extras?.memoryTest?.sameJump;
  const truth = e?.extras?.speedTest?.truth;
  const g = e?.comparisons.find((c) => c.param === "g");
  const per = sj ? sj.jumps.map((j) => `jump ${j.jump} ${j.ratio.toFixed(2)}×`).join(", ") : "";
  const slow = sj ? `${sj.combined.ratio.toFixed(3)} ± ${sj.combined.sigma.toFixed(3)}×` : "";
  const alt = `Photo-finish of John Young’s two jumps on the Moon: A, the Apollo 16 broadcast, above; B, the same clip slowed${truth ? ` ${truth}×` : ""} in secret, below, on one clock. Each jump in A is joined to the same jump in B${per ? ` (${per})` : ""}${slow ? `; B is ${slow} slower, jump for jump${truth ? `, truth ${truth}×` : ""}` : ""}.`;
  return (
    <figure className={styles.still}>
      <Link href="/" className={styles.link} aria-label="Open the home page, where this print develops from both clips">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero-final.webp" alt={alt} width={size.width} height={size.height} decoding="async" fetchPriority="high" />
        <b className={styles.key} style={{ top: "5%" }} aria-hidden="true">
          A · broadcast
        </b>
        <b className={styles.key} style={{ top: "56%" }} aria-hidden="true">
          B · slowed in secret
        </b>
      </Link>
      <figcaption>
        The opening print, finished: every frame of both clips cut to one slice, on one clock{g ? `; from A, the Moon’s gravity ${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s²` : ""}{slow ? `; B ${slow} slower, jump for jump` : ""}. <Link href="/">Watch it develop</Link>
      </figcaption>
    </figure>
  );
}
