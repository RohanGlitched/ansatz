import type { Metadata, Viewport } from "next";
import { Host_Grotesk } from "next/font/google";
import Link from "next/link";
import "katex/dist/katex.min.css";
import "./globals.css";
import styles from "./layout.module.css";

const host = Host_Grotesk({ subsets: ["latin"], variable: "--font-host", display: "swap" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ansatz-lab.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Ansatz: film anything that moves, get the law that moves it", template: "%s · Ansatz" },
  description:
    "Ansatz turns a phone video into a physics experiment. SAM 3.1 measures every frame, Muse Spark and Muse Wonder propose equations of motion, and the law that predicts the part of the clip it never saw wins.",
  openGraph: { type: "website", siteName: "Ansatz" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#f2f3f0", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={host.variable}>
      <body>
        <header className={styles.top}>
          <div className={`wrap ${styles.bar}`}>
            <Link href="/" className={styles.brand} aria-label="Ansatz home">
              <Mark />
              <span>Ansatz</span>
            </Link>
            <nav className={styles.nav} aria-label="Main">
              <Link href="/#experiments">Experiments</Link>
              <Link href="/proof">Proof</Link>
              <Link href="/how">How it works</Link>
              <Link href="/new" className={styles.cta}>
                Run an experiment
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className={styles.foot}>
          <div className={`wrap ${styles.footGrid}`}>
            <div>
              <Link href="/" className={styles.brand}>
                <Mark />
                <span>Ansatz</span>
              </Link>
              <p className="small" style={{ marginTop: 12, maxWidth: "36ch" }}>
                <em>Ansatz</em> (German, physics): an educated guess at the form of a law, made before the data says whether it holds.
              </p>
            </div>
            <div>
              <h3 className={styles.fh}>Lab</h3>
              <Link href="/new">Run an experiment</Link>
              <Link href="/#experiments">Experiments</Link>
              <Link href="/proof">Proof: the benchmark</Link>
              <Link href="/how">How it works</Link>
            </div>
            <div>
              <h3 className={styles.fh}>Built with Meta</h3>
              <span>SAM 3.1 measures every frame</span>
              <span>Muse Spark watches, proposes laws, referees</span>
              <span>Muse Wonder, an agent with a fitting tool, tries laws and submits one</span>
              <span>Muse Voice Transcribe hears the narration</span>
            </div>
            <div>
              <h3 className={styles.fh}>Project</h3>
              <a href="https://github.com/RohanGlitched/ansatz">Code on GitHub</a>
              <span>Meta Global AI Developer Hackathon, 2026</span>
              <span>Clips credited on each experiment</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

function Mark() {
  // a parabola through five strobe dots: the product in one glyph
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect width="26" height="26" rx="5" fill="#0e1012" />
      <path d="M4 21 Q13 -6 22 21" stroke="#2d4bff" strokeWidth="1.6" fill="none" />
      {[
        [5.2, 17.4],
        [8.6, 9.6],
        [13, 7.2],
        [17.4, 9.6],
        [20.8, 17.4],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.9" fill="#ff5a1f" />
      ))}
    </svg>
  );
}
