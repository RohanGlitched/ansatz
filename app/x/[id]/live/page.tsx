import ExperimentView, { experimentMetadata } from "../view";

// a visitor's run, rendered on each request (the middleware rewrites /x/<run id> here; the address stays /x/<run id>)
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string }> };

export async function generateMetadata({ params, searchParams }: Params) {
  const { id } = await params;
  const { lang } = await searchParams;
  return experimentMetadata(id, lang);
}

export default async function LiveExperimentPage({ params, searchParams }: Params) {
  const { id } = await params;
  const { lang } = await searchParams;
  return <ExperimentView id={id} lang={lang} />;
}
