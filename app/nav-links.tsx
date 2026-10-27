"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/x", label: "Experiments", match: (p: string) => p === "/x" || p.startsWith("/x/") || p.startsWith("/series/") },
  { href: "/proof", label: "Proof", match: (p: string) => p.startsWith("/proof") },
  { href: "/how", label: "How it works", match: (p: string) => p.startsWith("/how") },
  { href: "/judges", label: "For judges", match: (p: string) => p.startsWith("/judges") },
];

/** The header's section links, with the current section marked for screen readers and by an underline. */
export default function NavLinks() {
  const p = usePathname() ?? "/";
  return (
    <>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(p) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </>
  );
}
