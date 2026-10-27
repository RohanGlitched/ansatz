import type { MetadataRoute } from "next";
import { showcaseIds } from "@/lib/experiments";
import { getSeries } from "@/lib/series";

const SITE = "https://ansatz-lab.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/judges", "/x", "/proof", "/how", "/new", "/class/new", "/class/demo23", "/series/pendulum-lengths"];
  const ids = await showcaseIds();
  // the pendulum series' four runs are experiments too, though the gallery leaves them out
  const series = await getSeries("pendulum-lengths").catch(() => null);
  const all = [...ids, ...(series?.ids ?? []).filter((id) => !ids.includes(id))];
  return [
    ...pages.map((p) => ({ url: `${SITE}${p}`, changeFrequency: "weekly" as const, priority: p === "" || p === "/judges" ? 1 : p === "/x" || p === "/proof" ? 0.9 : 0.7 })),
    ...all.flatMap((id) => [{ url: `${SITE}/x/${id}`, priority: 0.8 }, { url: `${SITE}/x/${id}/report`, priority: 0.4 }]),
  ];
}
