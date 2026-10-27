import type { MetadataRoute } from "next";

const SITE = "https://ansatz-lab.vercel.app";

export default function robots(): MetadataRoute.Robots {
  // everything a reader or a judge's agent might want is public; the API routes run models and cost money
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }], sitemap: `${SITE}/sitemap.xml` };
}
