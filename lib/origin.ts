/** Whether a request's Origin header (if any) names this site. An unparsable origin such as the literal "null" is cross-origin. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export const crossOrigin = () => Response.json({ error: "Cross-origin requests are not accepted." }, { status: 403 });
