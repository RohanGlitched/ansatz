import Link from "next/link";
import { getExperiment, showcaseIds } from "@/lib/experiments";

export default async function Home() {
  const ids = await showcaseIds();
  const exps = (await Promise.all(ids.map(getExperiment))).filter(Boolean);
  return (
    <div className="wrap" style={{ padding: "48px 0" }}>
      <h1>Film anything that moves. Get the law that moves it.</h1>
      <ul>
        {exps.map((e) => (
          <li key={e!.id}>
            <Link href={`/x/${e!.id}`}>{e!.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
