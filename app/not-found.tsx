import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(48px, 8vw, 120px)", maxWidth: "70ch" }}>
      <h1 style={{ fontSize: "clamp(30px, 4vw, 44px)" }}>Nothing moves here.</h1>
      <p className="lede" style={{ marginTop: 14 }}>
        That page doesn’t exist, or the experiment it pointed to has expired. Visitors’ clips are kept for two days; their results stay.
      </p>
      <p style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link className="btn" href="/x/moon-jump">
          See the Moon experiment
        </Link>
        <Link className="btn ghost" href="/new">
          Run your own
        </Link>
        <Link className="btn ghost" href="/proof">
          How it’s checked
        </Link>
      </p>
    </div>
  );
}
