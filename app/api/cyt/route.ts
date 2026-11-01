import { canYouTell } from "@/app/cyt";

// the same stored runs the home page reads, rebuilt at most once a minute like it
export const dynamic = "force-static";
export const revalidate = 60;

/**
 * The answers to "Can you tell?" on the home page: what Muse Spark answered, what Ansatz measured and the truth for
 * each clip, with the tally. Served apart from the page, and fetched only when the reader asks for them, so the page
 * itself carries nothing that gives a clip away.
 */
export async function GET() {
  const c = await canYouTell().catch(() => null);
  if (!c) return Response.json({ error: "The answers could not be read." }, { status: 503 });
  return Response.json(c.answers);
}
