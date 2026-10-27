import type { MetadataRoute } from "next";
import { showcaseIds } from "@/lib/experiments";

const SITE = "https://ansatz-lab.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/judges", "/proof", "/how", "/new", "/class/new", "/class/demo23", "/series/pendulum-lengths"];
  const ids = await showcaseIds();
  return [
    ...pages.map((p) => ({ url: `${SITE}${p}`, changeFrequency: "weekly" as const, priority: p === "" || p === "/judges" ? 1 : 0.7 })),
    ...ids.flatMap((id) => [{ url: `${SITE}/x/${id}`, priority: 0.8 }, { url: `${SITE}/x/${id}/report`, priority: 0.4 }]),
  ];
}
