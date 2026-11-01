# Links to add for /lab

/lab is the teachers' page: the nine Class XI practicals about motion and force (CBSE curriculum 2026-27, PDF pp. 7–9, and the NCERT Class XI lab manual), each mapped to the run that already does it, with a bilingual worksheet and a 40-minute lesson on the Falsification Plate. Two are covered in full (Section A Experiment 7, the pendulum; Activity 7, energy dissipation), two in part (Activity 5, projectile; Section B Experiment 2, spring by oscillation), five not yet. The counts below are the page's own; if `app/lab/practicals.ts` changes, change them here too.

These files are being edited by another agent, so the lines are given here to paste, not applied.

## Home, §3 "Who it is for" (app/page.tsx)

At the end of the paragraph that starts `<b>A teacher with forty students.</b>`, add:

```tsx
{" "}For tomorrow&rsquo;s class: <Link href="/lab">the Class XI motion practicals mapped to runs, with a worksheet in English and Hindi and a 40-minute lesson</Link>.
```

## /judges, the Impact row (app/judges/page.tsx)

Add this as a point in the Impact criterion's `points` (after the class-code point):

```tsx
<>For a teacher tomorrow: <Link href="/lab">/lab</Link> maps the nine Class XI practicals about motion and force (CBSE 2026-27 and the NCERT lab manual, each cited by page) to runs: two covered in full, two in part, five not yet, each with what to film, what to tape up, the stored run&rsquo;s accuracy and a report that prints, plus a worksheet in English and Hindi and a 40-minute lesson on the Falsification Plate. No teacher has used it yet.</>,
```

And add to the Impact row's `evidence`:

```ts
{ label: "For teachers: the Class XI practicals", href: "/lab" },
```

If the Impact `claim` keeps "Next, a physics lab in a phone propped on books", this reads better and stays honest: `Next, the Class XI pendulum and dissipation practicals, today, with these runs (/lab).`

## SUBMISSION-FORM.md, "Why it matters" (../SUBMISSION-FORM.md, line starting `Why it matters:`)

Append one sentence:

```
For teachers, ansatz-lab.vercel.app/lab maps the nine Class XI practicals about motion and force to runs (two in full, two in part, five not yet, each cited to the CBSE syllabus and NCERT lab manual), with a worksheet in English and Hindi and a 40-minute lesson; no teacher has used it yet.
```

## On the "1.25 lakh schools" figure

The site already cites it (/judges Impact, to Education for All in India's analysis of UDISE+ 2025-26). /lab repeats it once, in §6, with the same source, followed by the narrower line: "Two of the nine Class XI practicals about motion and force, in full, today, with these runs; two more in part." Anywhere else, prefer that line to the school count.

## Sitemap and llms.txt (not edited; add when those files are free)

- `app/sitemap.ts`: add `"/lab"` to the `pages` array (priority 0.8 suits it).
- `app/llms.txt/route.ts`: add a line near the series entry:

```ts
p(`- ${SITE}/lab : For teachers. The nine CBSE Class XI practicals about motion and force (curriculum 2026-27, with the NCERT lab manual's entries), each with what Ansatz does today: 2 covered (pendulum, energy dissipation), 2 in part (projectile, spring by oscillation), 5 not yet; the run for each, what to film, what to tape up, accuracy read from the stored runs, printable reports, a two-page worksheet in English and Hindi, and a 40-minute lesson plan. No teacher has used it yet.`);
```

- Optional, in the footer's "The lab" column (app/layout.tsx): `<Link href="/lab">For teachers: Class XI practicals</Link>`.

## Already done with the page

- `scripts/check-pages.mjs` lists `/lab` among the pages it fetches and among the 390 px layout checks.
- `test/lab-worksheet.test.ts` checks the Hindi worksheet line for line against the English, and that every practical cites its CBSE page.
