import { getExperiment, showcaseIds, videoUrl } from "@/lib/experiments";

export const runtime = "nodejs";

const SITE = "https://ansatz-lab.vercel.app";

// SAM's masks (run-length strings, heavy and unreadable) and the repository paths of control clips
const DROP = new Set(["rle", "file"]);

/** Drops those keys wherever they sit in the record. */
function withoutMasks(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutMasks);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, withoutMasks(x)]));
  return v;
}

/**
 * The stored experiment as JSON, for agents and anyone checking a number: the observation, every candidate law with
 * its fit, the referee's critique, Muse Wonder's attempts, the comparisons and the model ledger. Left out: SAM's
 * masks, storage paths of uploaded and control clips, and a student's name.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await getExperiment(id);
  if (!e) return Response.json({ error: "No such experiment.", index: `${SITE}/x` }, { status: 404 });
  const shipped = (await showcaseIds()).includes(e.id) || e.source.kind === "showcase";
  const { student: _student, strobe, extras, ...rest } = e;
  void _student;
  const record = {
    links: {
      page: `${SITE}/x/${e.id}`,
      report: `${SITE}/x/${e.id}/report`,
      csv: `${SITE}/x/${e.id}/data.csv`,
      video: `${SITE}${videoUrl(e)}`,
      guide: `${SITE}/llms.txt`,
    },
    note: "The stored record the experiment page is drawn from. Removed: SAM's segmentation masks (strobe[].rle), storage paths of clips, and a student's name. The winning law is candidates[] where law.id equals winner; trainFrac is the share of frames each law was fitted to, and fit.testRms is its miss on the rest.",
    ...rest,
    // where the clip is served from, not where it is stored
    source: { ...e.source, video: videoUrl(e) },
    strobe: strobe.map(({ f, t, box }) => ({ f, t, box })),
    extras,
  };
  return new Response(JSON.stringify(withoutMasks(record), null, 2) + "\n", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // a shipped run changes only with a deploy; a visitor's run never changes once written
      "cache-control": shipped ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" : "public, max-age=300, s-maxage=86400",
      "access-control-allow-origin": "*",
    },
  });
}
