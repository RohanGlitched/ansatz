"use client";

/**
 * Print one part of /lab: the worksheet in English, in Hindi, both, or the lesson plan. The choice is set on <html>
 * for the print stylesheet (app/lab/page.tsx) and cleared once the print dialog closes. Ctrl+P with no choice prints
 * the worksheet in both languages.
 */
type Part = "en" | "hi" | "both" | "plan";

export default function PrintControls({ parts, className }: { parts: { part: Part; label: string; primary?: boolean }[]; className?: string }) {
  const print = (part: Part) => {
    const html = document.documentElement;
    html.dataset.print = part;
    const done = () => {
      delete html.dataset.print;
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  return (
    <div className={className}>
      {parts.map((p) => (
        <button key={p.part} type="button" className={`btn${p.primary ? "" : " ghost"}`} onClick={() => print(p.part)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}
