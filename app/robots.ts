import type { MetadataRoute } from "next";

const SITE = "https://ansatz-lab.vercel.app";

export default function robots(): MetadataRoute.Robots {
  // every page and stored result is public; the API routes run models and cost money (health only reads)
  return { rules: [{ userAgent: "*", allow: ["/", "/api/health"], disallow: ["/api/"] }], sitemap: `${SITE}/sitemap.xml` };
}
