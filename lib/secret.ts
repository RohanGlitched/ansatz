import { createHash, timingSafeEqual } from "node:crypto";

/** Compares a presented token with the configured one in constant time; an unset secret matches nothing. */
export function sameSecret(given: string | null | undefined, secret: string | undefined) {
  if (!secret || !given) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(given), h(secret));
}
