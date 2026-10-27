import { readdir } from "node:fs/promises";
import path from "node:path";
import { LANGUAGES } from "@/lib/translate";
import ExperimentView, { experimentMetadata } from "../view";

// a shipped run's translations ship with it, so each language is a page built ahead like the English one
export const revalidate = 3600;
export const dynamicParams = false;

type Params = { params: Promise<{ id: string; lang: string }> };

export async function generateStaticParams() {
  const files = await readdir(path.join(process.cwd(), "data", "showcase", "translations")).catch(() => [] as string[]);
  // only the translations that exist: id.lang.json
  return files
    .map((f) => /^([a-z0-9-]+)\.([a-z]{2})\.json$/.exec(f))
    .filter((m): m is RegExpExecArray => !!m && !!LANGUAGES[m[2]])
    .map((m) => ({ id: m[1], lang: m[2] }));
}

export async function generateMetadata({ params }: Params) {
  const { id, lang } = await params;
  return experimentMetadata(id, lang);
}

export default async function TranslatedExperimentPage({ params }: Params) {
  const { id, lang } = await params;
  return <ExperimentView id={id} lang={lang} />;
}
