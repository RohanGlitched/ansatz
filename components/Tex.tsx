import katex from "katex";

/** Server-rendered LaTeX (KaTeX): equations arrive as HTML, no client script. */
export default function Tex({ children, display = false, className }: { children: string; display?: boolean; className?: string }) {
  const html = katex.renderToString(children, { displayMode: display, throwOnError: false, strict: "ignore", output: "html" });
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
