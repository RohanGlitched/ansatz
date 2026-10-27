import Tex from "./Tex";
import MaskOutline from "./MaskOutline";
import PipelineLight from "./PipelineLight";
import { fmtMiss, slitOf } from "./strip";
import type { Experiment } from "@/lib/experiment";
import { lawLatex } from "@/lib/latex";
import { toPixels } from "@/lib/pixels";
import styles from "./PipelineBand.module.css";

/**
 * The whole method on one band, every picture from one real run (John Young's jump on the Moon): the clip, SAM 3.1's
 * mask on one of its frames, the photo-finish with the measured helmet, the laws proposed, the 70/30 race on the
 * frames no law was fitted to, and the verdict. Each node links to its step below. The nodes light in order the first
 * time the band is seen, the way a run passes through them; with reduced motion they are simply all lit.
 */
export default function PipelineBand({ e, anchors }: { e: Experiment; anchors: { clip: string; mask: string; slit: string; laws: string; race: string; verdict: string } }) {
  const m = e.measured;
  const n = m.px.length;
  const slit = slitOf(e.id);
  const fw = e.video.codedWidth ?? e.video.width, fh = e.video.height;
  // the frame on /how/moon-frame.webp: the stored mask nearest the top of the jump (scripts/stills.mjs picks the same)
  const top = m.px.reduce((p, q) => (q.y < p.y ? q : p), m.px[0]);
  const masks = e.strobe.filter((s) => s.rle);
  const mask = masks.length ? masks.reduce((p, q) => (Math.abs(q.f - top.f) < Math.abs(p.f - top.f) ? q : p)) : null;
  const ok = e.candidates.filter((c) => c.fit.ok);
  const win = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  // the race shows the winner against the law that misses the unseen frames worst, so one lands and one flies off
  const rival = ok.filter((c) => c.law.id !== win.law.id).reduce<typeof win | null>((p, q) => (!p || q.fit.testRms > p.fit.testRms ? q : p), null);
  const split = Math.min(n - 1, Math.max(1, Math.round(n * e.trainFrac)));
  const ys = m.px.map((p) => p.y);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = Math.max(2, (y1 - y0) * 0.45);
  const RW = 200, RH = 100;
  const rx = (i: number) => 8 + (i / Math.max(1, n - 1)) * (RW - 16);
  const ry = (y: number) => ((y - (y0 - pad)) / (y1 - y0 + 2 * pad)) * RH;
  const lawPath = (c: typeof win, from: number, to: number) => {
    const px = toPixels(c.fit.predicted, m);
    let d = "";
    for (let i = from; i <= to; i++) if (px[i] && Number.isFinite(px[i].y)) d += `${d ? "L" : "M"}${rx(i).toFixed(1)} ${ry(px[i].y).toFixed(1)}`;
    return d;
  };
  const ch = Object.keys(win.fit.predicted);
  const g = e.comparisons.find((c) => c.param === "g");
  // two laws that read differently: the winner first, then the proposals in rank order, one per distinct equation
  const seenTex = new Set<string>();
  const laws = [win, ...e.candidates.filter((c) => c.origin === "muse" && c !== win)].filter((c) => {
    const t = lawLatex(c.law).at(-1) ?? "";
    if (!t || seenTex.has(t)) return false;
    seenTex.add(t);
    return true;
  }).slice(0, 2);
  const slitDots = slit ? m.px.filter((_, i) => i % 3 === 0).map((p) => ({ x: ((p.f + 0.5) / slit.frames) * 100, y: (p.y / slit.height) * 100 })) : [];

  const nodes = [
    {
      key: "clip",
      href: anchors.clip,
      step: "Clip",
      who: "the file’s own clock",
      pic: (
        <span className={styles.pic} style={{ aspectRatio: `${e.video.width} / ${fh}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/how/moon-frame.webp" alt="" />
        </span>
      ),
      note: `${e.video.frames} frames, ${e.video.duration.toFixed(1)} s, each timed`,
    },
    {
      key: "mask",
      href: anchors.mask,
      step: "SAM mask",
      who: "SAM 3.1",
      pic: (
        <span className={`${styles.pic} ${styles.masked}`} style={{ aspectRatio: `${e.video.width} / ${fh}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/how/moon-frame.webp" alt="" />
          {mask && <MaskOutline mask={mask} width={fw} height={fh} fill />}
        </span>
      ),
      note: mask ? `“${e.tracking.noun}”, frame ${mask.f}: the mask is the measurement` : `“${e.tracking.noun}”, every frame`,
    },
    {
      key: "slit",
      href: anchors.slit,
      step: "Slit-scan",
      who: "one slice per frame",
      pic: (
        <span className={`${styles.pic} ${styles.slit}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/slits/thumb/${e.id}.webp`} alt="" />
          {slitDots.map((p, i) => (
            <i key={i} style={{ left: `${p.x}%`, top: `${p.y}%` }} />
          ))}
        </span>
      ),
      note: `${n} helmet positions, one per frame of the jump`,
    },
    {
      key: "laws",
      href: anchors.laws,
      step: "Laws",
      who: "Muse Spark 1.3",
      pic: (
        <span className={`${styles.pic} ${styles.laws}`}>
          {laws.map((c) => (
            <span key={c.law.id} className={styles.law}>
              <Tex>{lawLatex(c.law).at(-1) ?? ""}</Tex>
              <small>{c.law.title}</small>
            </span>
          ))}
        </span>
      ),
      note: `${e.candidates.length} candidates, textbook controls included`,
    },
    {
      key: "race",
      href: anchors.race,
      step: "70/30 race",
      who: "RK4 and Levenberg–Marquardt",
      pic: (
        <span className={`${styles.pic} ${styles.race}`}>
          <svg viewBox={`0 0 ${RW} ${RH}`} preserveAspectRatio="none" aria-hidden="true">
            <rect x={rx(split)} y={0} width={RW - rx(split)} height={RH} className={styles.unseen} />
            <line x1={rx(split)} x2={rx(split)} y1={0} y2={RH} className={styles.splitLine} vectorEffect="non-scaling-stroke" />
            {rival && <path d={lawPath(rival, split, n - 1)} className={styles.rival} vectorEffect="non-scaling-stroke" />}
            <path d={lawPath(win, 0, n - 1)} className={styles.winLaw} vectorEffect="non-scaling-stroke" />
          </svg>
          {m.px.map((p, i) => (
            <i key={i} className={i < split ? styles.seen : styles.ring} style={{ left: `${(rx(i) / RW) * 100}%`, top: `${(ry(p.y) / RH) * 100}%` }} />
          ))}
          <em className={styles.raceSplit} style={{ left: `${(rx(split) / RW) * 100}%` }}>
            70 | 30
          </em>
        </span>
      ),
      note: rival ? `unseen 30%: ${win.law.title.toLowerCase()} misses ${fmtMiss(win.fit.testRms, e, ch)}, ${rival.law.title.toLowerCase()} ${fmtMiss(rival.fit.testRms, e, ch)}` : `unseen 30%: ${fmtMiss(win.fit.testRms, e, ch)}`,
    },
    {
      key: "verdict",
      href: anchors.verdict,
      step: "Verdict",
      who: "code writes every number",
      pic: (
        <span className={`${styles.pic} ${styles.verdict}`}>
          {g ? (
            <>
              <strong>{g.measured.toFixed(2)}</strong>
              <span>± {g.sigma.toFixed(2)} m/s²</span>
            </>
          ) : (
            <strong>{win.law.title}</strong>
          )}
        </span>
      ),
      note: g ? `g on the Moon, by ${win.law.title.toLowerCase()} (textbook ${g.reference})` : win.law.title,
    },
  ];

  return (
    <PipelineLight className={styles.band}>
      <ol className={styles.nodes} aria-label="The method, on one run: the Moon jump">
        {nodes.map((x, i) => (
          <li key={x.key} className={styles.node} data-node={i} style={{ ["--i" as string]: i }}>
            <a href={x.href} className={styles.card}>
              <span className={styles.head}>
                <b>{i + 1}</b> {x.step}
                <span className={styles.who}>{x.who}</span>
              </span>
              {x.pic}
              <span className={styles.note}>{x.note}</span>
            </a>
          </li>
        ))}
      </ol>
    </PipelineLight>
  );
}
