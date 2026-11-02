/**
 * The sealed-law sentences the README and the submission form quote, computed from the records by app/sealed.ts (the
 * same counts every page prints), so neither file types a count of its own.
 *
 *   npx tsx --conditions=react-server scripts/sealed-copy.ts           print the README bullet and the form sentence
 *   npx tsx --conditions=react-server scripts/sealed-copy.ts --check   exit 1 if README.md or ../SUBMISSION-FORM.md lacks them
 */
import { readFileSync } from "node:fs";
import { sealedTest } from "../app/sealed";

// both files use straight apostrophes
const plain = (t: string) => t.replace(/’/g, "'");

const t = await sealedTest();
if (!t) {
  console.error("no sealed records");
  process.exit(2);
}
const lines = { "README.md": `- ${plain(t.readme)}`, "../SUBMISSION-FORM.md": `- ${plain(t.form)}` };
if (process.argv.includes("--check")) {
  let bad = 0;
  for (const [file, line] of Object.entries(lines)) {
    const ok = readFileSync(file, "utf8").replace(/\r\n/g, "\n").includes(line);
    console.log(`${ok ? "ok     " : "STALE  "} ${file}`);
    if (!ok) bad++;
  }
  if (bad) console.log("\nexpected:\n" + Object.values(lines).join("\n\n"));
  process.exit(bad ? 1 : 0);
}
for (const [file, line] of Object.entries(lines)) console.log(`== ${file}\n${line}\n`);
