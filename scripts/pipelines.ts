// usage: npx tsx scripts/pipelines.ts   rewrites data/bench/pipelines.json (served at /bench/pipelines.json)
//
// Which version of the method made each stored run: every published showcase record, read from data/showcase, plus the
// rows that are not showcases (an unpublished stranger's run, the benchmark). The method versions and the hand-written
// "madeWith" notes are kept from the existing file; a record with no note gets one from its tag and the commit history.
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PIPELINE } from "../lib/experiment";

type Run = { id: string; file: string; createdAt: string; pipeline: string; set: string; madeWith: string };
type File = { generatedAt: string; current: string; note: string; versions: { tag: string; from: string; changes: string }[]; runs: Run[] };

const OUT = path.join("data", "bench", "pipelines.json");
const DIR = path.join("data", "showcase");

/** what made a 2026-11-02a record (the first three sealed laws and the 60 cm Aachen pendulum, all made before 56b2e88) */
const MADE_02A =
  "2026-11-02a: a working tree with uncommitted edits (lib/experiment.ts among them) at 2752b74, later committed as 56b2e88 (05:23 IST, after these runs): the closest committed match, not proven identical; prompts and physics code as at 1811071";

/** the second sealed set's code, from .probe/sealed/NOTES.md (addendum a) */
const MADE_SET2: Record<string, string> = {
  "sealed-law-6604980": "2026-11-02a at 4b94c8b (the tree was clean apart from the hash files 80 s before the run; not re-checked at the start)",
  "sealed-law-6604981": "2026-11-02a at 4b94c8b (the tree was clean apart from the hash files 80 s before the run; not re-checked at the start)",
  "sealed-law-6604982": "2026-11-02a at b0fba2a (the same code as 4b94c8b), probably with the uncommitted lite-mode edits later committed as ee54330",
};

/** 56b2e88's commit time: records made before it ran on uncommitted round-14 code */
const AT_56B2E88 = "2026-11-01T23:53:12Z";

const old = JSON.parse(await readFile(OUT, "utf8")) as File;
const kept = new Map(old.runs.map((r) => [r.id, r]));
const order = JSON.parse(await readFile(path.join(DIR, "order.json"), "utf8")) as string[];
const ids = (await readdir(DIR)).filter((f) => f.endsWith(".json") && f !== "order.json").map((f) => f.replace(/\.json$/, ""));
// the published records, in the book's order, then the pendulum-lengths series; a record not yet in order.json waits
// until it is published (re-run this script then)
const series = (id: string) => /^pendulum-\d+cm$/.test(id);
const all = [...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id) && series(id)).sort()];

const showcase: Run[] = [];
for (const id of all) {
  const e = JSON.parse(await readFile(path.join(DIR, `${id}.json`), "utf8")) as { createdAt: string; pipeline?: string };
  const tag = e.pipeline ?? "before version stamps";
  const was = kept.get(id);
  showcase.push({
    id,
    file: `data/showcase/${id}.json`,
    createdAt: e.createdAt,
    pipeline: tag,
    set: order.includes(id) ? "showcase" : /^pendulum-\d+cm$/.test(id) ? "showcase (the pendulum-lengths series)" : "stored, not yet in the book",
    madeWith: was?.madeWith ?? MADE_SET2[id] ?? (tag === "2026-11-02a" && e.createdAt < AT_56B2E88 ? MADE_02A : tag),
  });
}
const others = old.runs.filter((r) => !r.file.startsWith("data/showcase/"));
const n02a = showcase.filter((r) => r.pipeline === PIPELINE).length;

const out: File = {
  generatedAt: new Date().toISOString(),
  current: PIPELINE,
  note: `Which version of the method made each stored run. The tag is bumped when the method changes in a way that can change results (lib/experiment.ts PIPELINE). ${n02a ? `${n02a} published run${n02a === 1 ? " was" : "s were"} made on ${PIPELINE}` : `No published run was made on ${PIPELINE}`}; every other record keeps the tag it was made with, and the pages show it. Records made on 1 to 2 November before the bump carry 2026-10-27c, although parts of the round-12 and round-13 changes were already in the code that made them (see madeWith). Written by scripts/pipelines.ts from the stored records.`,
  versions: old.versions,
  runs: [...showcase, ...others],
};
await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${OUT}: ${showcase.length} showcase records (${n02a} on ${PIPELINE}) and ${others.length} others`);
