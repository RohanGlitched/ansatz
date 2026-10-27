import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import type { Experiment } from "../lib/experiment";
import { buildReplay, finalSummary, type StoredReplay } from "../data/replays/derive";
import { fmtZ, noiseScore, readoutOf, tiedScores } from "../components/liveStripMath";

const stored = readdirSync("data/replays").filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`data/replays/${f}`, "utf8")) as StoredReplay);
const record = (id: string) => JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment;

test("each replay ends on its showcase page's finding", () => {
  assert.ok(stored.length >= 3);
  for (const s of stored) {
    const e = record(s.record);
    const r = buildReplay(s, e);
    assert.equal(finalSummary(r), e.finding, `${s.id}: the replay's summary is not ${s.record}'s finding`);
  }
});

test("stored replays keep timings and SAM points only: every line of text comes from the record", () => {
  for (const s of stored) {
    for (const ev of s.events) {
      assert.equal((ev as { detail?: string }).detail, undefined, `${s.id}: a stored ${ev.step} event carries text`);
      if (ev.state !== "update") assert.equal(ev.data, undefined, `${s.id}: a stored ${ev.step} ${ev.state} event carries data`);
    }
    const ats = s.events.map((e) => e.at);
    assert.deepEqual(ats, [...ats].sort((a, b) => a - b), `${s.id}: events out of order`);
  }
});

test("a replay's board, points and fit line agree with the record", () => {
  for (const s of stored) {
    const e = record(s.record);
    const r = buildReplay(s, e);
    const m = r.events.find((x) => x.step === "measure" && x.state === "done")!.data as { px: unknown[]; k: number[] };
    assert.equal(m.px.length, m.k.length);
    // the final board (after Muse Wonder, when it was called) leads with the record's winner
    const boards = r.events.filter((x) => x.state === "done" && (x.data as { board?: unknown })?.board).map((x) => (x.data as { board: { id: string; path: unknown[] }[] }).board);
    const last = boards[boards.length - 1];
    assert.equal(last[0].id, e.winner, `${s.id}: the replay's winner is not the record's`);
    for (const b of last) assert.equal(b.path.length, m.px.length, `${s.id}/${b.id}: path and points differ in length`);
    // the observer → SAM handoff is one line
    const obs = r.events.find((x) => x.step === "observe" && x.state === "done")!.detail!;
    assert.match(obs, new RegExp(`observer: “[^”]+” → SAM prompt “${e.tracking.noun}”`));
  }
});

test("the hardening spring replays a visible win: Muse Wonder's law by about 229× on the unseen frames", () => {
  const s = stored.find((x) => x.id === "hardening-spring")!;
  const e = record("hardening-spring");
  const r = buildReplay(s, e);
  const ref = r.events.find((x) => x.step === "referee" && x.state === "done")!;
  const board = (ref.data as { board: { id: string; rel: number; z?: number }[] }).board;
  assert.equal(board[0].id, e.winner);
  const best = e.candidates.filter((c) => c.origin === "muse").sort((a, b) => a.fit.testRms - b.fit.testRms)[0];
  const ratio = best.fit.testRms / board[0].rel;
  assert.ok(ratio > 200 && ratio < 260, `ratio ${ratio}`);
  assert.ok(!tiedScores(board[0].z!, board[1].z!));
  // its last event is the run's recorded total
  assert.equal(r.events[r.events.length - 1].at, e.ledger.ms);
});

test("the Moon's race is a tie in noise units, and its readout is g against the Moon's", () => {
  const e = record("moon-jump");
  const [a, b] = [...e.candidates].sort((x, y) => x.rank - y.rank);
  assert.ok(tiedScores(noiseScore(a.fit)!, noiseScore(b.fit)!));
  assert.equal(fmtZ(noiseScore(a.fit)!), "1.0×");
  const ro = readoutOf(e);
  const g = e.comparisons.find((c) => c.param === "g")!;
  assert.match(ro.value, new RegExp(`^${g.measured.toFixed(2).replace(".", "\\.")} ± `));
  assert.match(ro.against, /Known value 1\.62/);
});
