# Ansatz design system: "a cyanotype lab book"

Ansatz is the scientific method in a box: watch, measure, guess a law, test it on frames it never saw. The site
looks like the object science used to publish that kind of work: a bound lab book of **cyanotype plates**
(Anna Atkins' 1843 sun-prints: specimens on a deep Prussian-blue ground) facing **typeset pages** in the face of
physics papers (Computer Modern, as LaTeX sets it). Every clip is printed as a sun-print; what SAM 3.1 measured
sits on it in orange; laws are drawn in white ink; a law the data refuted is struck through in red.

## Tokens (app/globals.css)

| token | value | use |
|---|---|---|
| `--prussian` | `#163d6e` | the cyanotype ground of every plate |
| `--prussian-deep` | `#0c264a` | shadow, footer, deepest areas of a plate |
| `--prussian-line` | `#3f68a0` | rules and axes drawn on a plate |
| `--prussian-ink` | `#dbe7f3` | secondary text on a plate |
| `--paper` | `#eef2f4` | the page (cool sun-print white, never cream) |
| `--paper-2` | `#e2e8ec` | a quieter band of page |
| `--paper-line` | `#c3ced7` | hairlines on paper |
| `--ink` | `#0f1d2e` | text on paper |
| `--ink-2` | `#43566b` | secondary text on paper |
| `--measured` | `#ff7b2e` | what SAM 3.1 measured (dots, trails, masks) on a plate |
| `--measured-ink` | `#b8460c` | the same, as text on paper |
| `--law` | `#ffffff` on plates, `--prussian` on paper | a law's curve / its prediction |
| `--struck` | `#ff5c7a` on plates, `#c3243f` on paper (`--struck-ink`) | a falsified law, misses |
| `--held` | `#8ef0c4` on plates, `#1d7a55` on paper (`--held-ink`) | a law that survived, a check that passed |

Nothing else. No gradients as decoration. Shadows only where something truly floats (a dialog).

## Type

- **Computer Modern** (`--cm`, KaTeX_Main woff2 files in `app/fonts`): display, headings, body, numbers. Upright
  for text, italic for variables and the wordmark. Body 19px / 1.62 on paper, measure ≤ 68ch.
- **Archivo** (`--ui`, Google, variable width): interface only: navigation, buttons, form controls, table column
  heads, figure labels, small captions on plates. 14–16px, normal tracking, **sentence case, never all caps**.
- Scale (perfect fourth from 18): 13.5 · 18 · 24 · 32 · 42.6 · 56.8 · 75.7. Headings use CM regular weight,
  sentence case, tight leading (1.08–1.15), no bold display.
- Numbers that matter are set big in CM with their uncertainty in a smaller size beside them: `1.494 ± 0.015×`.
- Equations are KaTeX, which is already CM: they sit in the text with no seam.

## Structure

- **Plates** (`<Plate n="I" title="…">` in `components/book/Plate.tsx`): full-bleed Prussian blocks with a
  hand-brushed emulsion edge (mask image `/book/emulsion.png`) and a caption line set like a book plate:
  "Plate II. The same jump, measured in every frame." Plates are numbered in page order; that numbering is real
  (they are referred to in the text). Clips on plates go through the cyanotype duotone (`filter: url(#cyanotype)`,
  defined once in the layout); a small "original colour" toggle removes it.
- **Pages** (paper): a single text column (680px) with a **margin column** (300px) on wide screens for sidenotes.
  Sidenotes (`<Note who="SAM 3.1">…</Note>`) say who produced a claim: SAM 3.1, Muse Spark, Muse Wonder,
  Muse Voice Transcribe, or "code". This is the provenance rule: every measured number on the site can be traced
  in the margin to the model or the code that produced it. On narrow screens notes drop below their paragraph.
- **Tables** are ruled like a journal: a heavy rule above the head, a hairline under it, a heavy rule at the end;
  no zebra, no card boxes. Numbers right-aligned, tabular figures.
- **Sections** of a long page are numbered §1, §2 … only when the page is a paper (home, how, proof); the method
  steps are a real sequence and are numbered.
- **Buttons**: one primary style (Prussian fill, paper text, 6px radius), one secondary (Prussian outline). On
  plates: paper fill with Prussian text. Button text says exactly what happens ("Run an experiment", "Watch the
  recorded run"). No arrows appended.
- **Links** in text: Prussian, underlined with a 1px offset underline.
- Radius: 6px on controls only. Plates have the brushed edge instead of a radius. Tables and figures: none.

## The signature: the Falsification Plate

`components/book/FalsifyPlate.tsx`. On an experiment's plate the clip's track is drawn as a chronophotograph
(orange dots on the sun-print), and a vertical line splits it: left of the line is "the past the laws may see",
right is "the future they must predict". The reader drags the line (or uses the arrow keys) from 30% to 90%. Each
candidate law's curve is drawn in white ink across the future; its miss is counted beside it; a law whose miss is
far above the noise is struck through in red, live. Data: `public/falsify/<id>.json`, made by
`scripts/falsify-grid.ts` with the same fitting code as a run (13 split positions, every law refitted at each).
The default position is the run's sealed 70%, and it is marked.

This is the one bold element. Everything around it is quiet: no scroll animations, no hover lifts, no
decorative motion. The only motion on the site is the data's own (clips, strips drawing at the clip's speed)
and responses to what the reader does. `prefers-reduced-motion` shows finished states.

## Copy rules

Plain, active, sentence case. Name things by what a student or teacher would call them. Every number keeps its
provenance and its uncertainty. The honesty wording already on the site (what is rendered vs filmed, what each
model did, "no law was fitted to the last 30%") must be preserved word for word in meaning; the check-pages
script bans the overclaims.

## Don'ts

No cream backgrounds, no near-black pages, no ALL-CAPS eyebrows, no `A · B · C` meta strings, no ` — `
spaced-dash labels, no monospace labels, no `→` on buttons, no identical rounded cards in grids, no fade-up on
scroll, no gradient washes.
