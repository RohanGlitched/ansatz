import { readdir } from "node:fs/promises";
import path from "node:path";
import ExperimentView, { experimentMetadata } from "./view";

// the shipped runs are built ahead and refreshed hourly; any other id here is a 404, and a visitor’s run is sent to
// ./live by the middleware
export const revalidate = 3600;
export const dynamicParams = false;

type Params = { params: Promise<{ id: string }> };

/** Every shipped experiment (data/showcase), so a judge's first click on any of them is a prebuilt page. */
export async function generateStaticParams() {
  const files = await readdir(path.join(process.cwd(), "data", "showcase")).catch(() => [] as string[]);
  return files.filter((f) => f.endsWith(".json") && f !== "order.json").map((f) => ({ id: f.replace(/\.json$/, "") }));
}

export async function generateMetadata({ params }: Params) {
  return experimentMetadata((await params).id);
}

export default async function ExperimentPage({ params }: Params) {
  return <ExperimentView id={(await params).id} />;
}
