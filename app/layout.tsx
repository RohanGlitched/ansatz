import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import localFont from "next/font/local";
import Link from "next/link";
import "katex/dist/katex.min.css";
import "./globals.css";
import styles from "./layout.module.css";
import NavLinks from "./nav-links";
import { CyanotypeDefs, Mark } from "@/components/book/Cyanotype";

// a lab book: Computer Modern, the face physics papers are set in (so text and equations share one voice), and a
// plain grotesque for the controls
const cm = localFont({
  src: [
    { path: "./fonts/KaTeX_Main-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/KaTeX_Main-Italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/KaTeX_Main-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/KaTeX_Main-BoldItalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-cm",
  display: "swap",
});
const ui = Archivo({ subsets: ["latin"], variable: "--font-ui", display: "swap", axes: ["wdth"] });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ansatz-lab.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Ansatz: film anything that moves, get the law that moves it", template: "%s · Ansatz" },
  description:
    "Ansatz turns a phone video into a physics experiment. SAM 3.1 measures every frame, Muse Spark and Muse Wonder propose equations of motion, and the law that predicts the part of the clip it never saw wins.",
  openGraph: { type: "website", siteName: "Ansatz" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#eef2f4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // no headers() here: reading the request in the root layout would make every page render on demand, and the pages
  // that only read stored runs are cached instead. A page read in another language marks its own text with lang.
  return (
    <html lang="en" className={`${cm.variable} ${ui.variable}`}>
      <head>
        <link rel="alternate" type="text/plain" href="/llms.txt" title="Guide for language-model agents" />
      </head>
      <body>
        <CyanotypeDefs />
        <a href="#main" className={styles.skip}>
          Skip to the page
        </a>
        <header className={styles.top}>
          <div className={styles.bar}>
            <Link href="/" className={styles.brand} aria-label="Ansatz home">
              <Mark />
              <span className={styles.word}>Ansatz</span>
            </Link>
            <nav className={styles.nav} aria-label="Main">
              <NavLinks />
            </nav>
            <Link href="/new" className={`btn ${styles.cta}`}>
              Run an experiment
            </Link>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className={styles.foot}>
          <div className={styles.footIn}>
            <div className={styles.colophon}>
              <Link href="/" className={styles.brand}>
                <Mark size={34} />
                <span className={styles.word}>Ansatz</span>
              </Link>
              <p>
                <em>Ansatz</em>, in physics: an educated guess at the form of a law, made before the data says whether it holds.
              </p>
              <p className={styles.small}>
                Set in Computer Modern and Archivo. Plates printed as cyanotypes, after Anna Atkins&rsquo; <em>Photographs of British Algae</em> (1843).
              </p>
            </div>
            <div className={styles.cols}>
              <div>
                <h3>The lab</h3>
                <Link href="/new">Run an experiment</Link>
                <Link href="/x">Every experiment, with its numbers</Link>
                <Link href="/series/pendulum-lengths">One pendulum, four lengths</Link>
                <Link href="/class/demo23">A class page</Link>
              </div>
              <div>
                <h3>The case</h3>
                <Link href="/proof">Proof: the benchmark</Link>
                <Link href="/how">How a law wins</Link>
                <Link href="/judges">For judges, in one page</Link>
                <a href="https://github.com/RohanGlitched/ansatz">The code, on GitHub</a>
              </div>
              <div>
                <h3>Built with Meta</h3>
                <span>SAM 3.1 measures every frame</span>
                <span>Muse Spark watches, proposes laws, referees</span>
                <span>Muse Wonder tries laws with a fitting tool</span>
                <span>Muse Voice Transcribe hears the narration</span>
              </div>
              <div>
                <h3>For machines</h3>
                <a href="/llms.txt">llms.txt</a>
                <a href="/bench">Benchmark data (JSON)</a>
                <span>Meta Global AI Developer Hackathon, 2026</span>
                <span>Clips credited on each experiment</span>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
